require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { WebSocketServer } = require("ws");
const { getConfig } = require("./config/env");
const { emitUiEvent, onUiEvent } = require("./events/bus");
const { twilioEvent, vadEvent } = require("./events/normalize");
const { buildTwiml } = require("./twilio/twiml");
const { createTwilioClient, startCall, hangupCall } = require("./twilio/callControl");
const { createSession, getSession, deleteSession } = require("./sessions/sessionStore");
const { createVadMock } = require("./mock/vadMock");
const { createAudioAiClient } = require("./grpc/client");

const config = getConfig();
const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  // Basic request log for debugging
  console.log(`[media-service] ${req.method} ${req.url}`);
  next();
});

const twilioClient = createTwilioClient(config);
let activeCallSid = null;
const audioAiClient = config.usePythonVad
  ? createAudioAiClient({
      protoPath:
        config.audioaiProtoPath ||
        path.join(__dirname, "../../../packages/proto/audioai.proto"),
      address: config.aiAudioGrpcUrl
    })
  : null;

function emitTwilio({ callSid, streamSid, event, data, ts }) {
  emitUiEvent(twilioEvent({ callSid, streamSid, event, data, ts }));
}

function emitVad({ session, action, prob = 0.8 }) {
  const ts = Date.now() - session.callStartAt;
  emitUiEvent(
    vadEvent({
      ts,
      source: "remote",
      action,
      prob
    })
  );
}

function mapVadAction(eventName) {
  if (!eventName) return null;
  const normalized = eventName.toLowerCase();
  if (normalized.includes("start")) return "start";
  if (normalized.includes("update")) return "update";
  if (normalized.includes("end")) return "end";
  return null;
}

app.post("/twiml", (req, res) => {
  console.log("[media-service] TwiML requested");
  const xml = buildTwiml({
    publicBaseUrl: config.publicBaseUrl,
    mediaWsPath: config.mediaWsPath
  });
  res.type("text/xml").send(xml);
});

app.post("/call/start", async (req, res) => {
  try {
    console.log("[media-service] Starting call", {
      to: config.fixedToNumber,
      from: config.twilioFromNumber
    });
    const call = await startCall({
      client: twilioClient,
      to: config.fixedToNumber,
      from: config.twilioFromNumber,
      twimlUrl: `${config.publicBaseUrl}/twiml`
    });
    console.log("[media-service] Call started", call.sid);
    activeCallSid = call.sid;
    emitTwilio({
      callSid: call.sid,
      event: "twilio.call.start",
      data: { to: config.fixedToNumber },
      ts: 0
    });
    res.json({ ok: true, callSid: call.sid });
  } catch (error) {
    emitUiEvent({
      id: "error-start-call",
      ts: 0,
      category: "ERROR",
      level: "ERROR",
      payload: { message: error.message }
    });
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/call/hangup", async (req, res) => {
  if (!activeCallSid) {
    console.log("[media-service] Hangup skipped (no active call)");
    return res.json({ ok: true, skipped: true });
  }
  try {
    console.log("[media-service] Hanging up call", activeCallSid);
    await hangupCall({ client: twilioClient, callSid: activeCallSid });
    emitTwilio({
      callSid: activeCallSid,
      event: "twilio.call.hangup",
      data: {},
      ts: 0
    });
    activeCallSid = null;
    res.json({ ok: true });
  } catch (error) {
    emitUiEvent({
      id: "error-hangup-call",
      ts: 0,
      category: "ERROR",
      level: "ERROR",
      payload: { message: error.message }
    });
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get(config.eventsPath, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders();

  const unsubscribe = onUiEvent((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: config.mediaWsPath });

wss.on("connection", (socket) => {
  console.log("[media-service] Media WS connected");
  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (message.event === "start") {
      console.log("[media-service] Media stream started", message.start?.streamSid);
      const streamSid = message.start.streamSid;
      const callSid = message.start.callSid;
      const session = createSession({ streamSid, callSid });
      if (config.usePythonVad && audioAiClient) {
        const grpcStream = audioAiClient.Stream();
        grpcStream.on("data", (event) => {
          const action = mapVadAction(event.event);
          if (!action) return;
          emitVad({
            session,
            action,
            prob: event.prob ?? 0.8
          });
        });
        grpcStream.on("error", (error) => {
          console.log("[media-service] gRPC stream error", error.message);
        });
        session.grpcStream = grpcStream;
      } else {
        session.vadMock = createVadMock({
          onStart: () => emitVad({ session, action: "start" }),
          onUpdate: () => emitVad({ session, action: "update", prob: 0.75 }),
          onEnd: () => emitVad({ session, action: "end", prob: 0 })
        });
      }
      emitTwilio({
        callSid,
        streamSid,
        event: "twilio.media.start",
        data: message.start,
        ts: 0
      });
      return;
    }

    if (message.event === "media") {
      const streamSid = message.streamSid;
      const session = getSession(streamSid);
      if (!session) return;
      session.lastAudioAt = Date.now();
      if (session.grpcStream) {
        session.seq += 1;
        session.grpcStream.write({
          session_id: streamSid,
          seq: session.seq,
          codec: "MULAW_8K",
          payload: Buffer.from(message.media.payload, "base64"),
          timestamp_ms: Date.now() - session.callStartAt
        });
      } else {
        session.vadMock?.onAudioFrame();
      }
      return;
    }

    if (message.event === "stop") {
      console.log("[media-service] Media stream stopped", message.streamSid);
      const streamSid = message.streamSid;
      const session = getSession(streamSid);
      if (session?.grpcStream) {
        session.grpcStream.end();
      } else if (session?.vadMock) {
        session.vadMock.stop();
      }
      emitTwilio({
        callSid: session?.callSid,
        streamSid,
        event: "twilio.media.stop",
        data: message.stop,
        ts: session ? Date.now() - session.callStartAt : 0
      });
      deleteSession(streamSid);
    }
  });
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`media-service listening on ${config.port}`);
});
