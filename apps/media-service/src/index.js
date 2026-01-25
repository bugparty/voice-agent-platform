require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { WebSocketServer } = require("ws");
const { getConfig } = require("./config/env");
const { emitUiEvent, onUiEvent } = require("./events/bus");
const { twilioEvent, vadEvent, dtmfEvent, ivrEvent } = require("./events/normalize");
const { buildTwiml, buildOutboundConferenceTwiml, buildWebJoinConferenceTwiml } = require("./twilio/twiml");
const { createTwilioClient, startCall, hangupCall, sendDtmf } = require("./twilio/callControl");
const { 
  createSession, 
  getSession, 
  getSessionByCallSid,
  getSessionBySessionId,
  deleteSession,
  generateSessionId,
  generateConfName,
  updateSession,
  updateSessionBySessionId
} = require("./sessions/sessionStore");
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const { createVadMock } = require("./mock/vadMock");
const { createAudioAiClient } = require("./grpc/client");
const { createIvrController } = require("./ivr/ivrController");

const config = getConfig();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends form-urlencoded data
app.use((req, res, next) => {
  // Basic request log for debugging
  console.log(`[media-service] ${req.method} ${req.url}`);
  next();
});

const twilioClient = createTwilioClient(config);
let activeCallSid = null;

const DTMF_COOLDOWN_MS = 700;
const DTMF_MAX_LEN = 16;
const DTMF_PATTERN = /^[0-9*#w]+$/i;
const audioAiClient = config.usePythonVad
  ? createAudioAiClient({
      protoPath:
        config.audioaiProtoPath ||
        path.join(__dirname, "../../../packages/proto/audioai.proto"),
      address: config.aiAudioGrpcUrl
    })
  : null;

if (config.usePythonVad) {
  console.log(`[media-service] Python VAD enabled, gRPC client: ${audioAiClient ? 'created' : 'FAILED'}, address: ${config.aiAudioGrpcUrl}`);
} else {
  console.log("[media-service] Python VAD disabled, using mock VAD");
}

function emitTwilio({ callSid, streamSid, event, data, ts }) {
  emitUiEvent(twilioEvent({ callSid, streamSid, event, data, ts }));
}

function emitVad({ session, action, prob = 0.8, track, musicProb = 0.0 }) {
  const ts = Date.now() - session.callStartAt;
  // Map track to source: "inbound" -> "remote", "outbound" -> "local"
  const source = track === "outbound" ? "local" : "remote";
  emitUiEvent(
    vadEvent({
      ts,
      source,
      action,
      prob,
      musicProb
    })
  );

  ivrController.handleVadEvent(session, action, source);
}

function emitDtmfEvent(session, { digits, status, reason }) {
  emitUiEvent(
    dtmfEvent({
      ts: Date.now() - session.callStartAt,
      sessionId: session.sessionId,
      callSid: session.callSid,
      digits,
      status,
      reason
    })
  );
}

function emitIvrEvent(session, state, detail) {
  emitUiEvent(
    ivrEvent({
      ts: Date.now() - session.callStartAt,
      sessionId: session.sessionId,
      state,
      detail
    })
  );
}

function validateDigits(digits) {
  if (!digits || typeof digits !== "string") return "missing";
  if (digits.length > DTMF_MAX_LEN) return "too_long";
  if (!DTMF_PATTERN.test(digits)) return "invalid_chars";
  return null;
}

function canSendDtmf(session) {
  return session?.phase === "IVR";
}

async function sendDtmfWithPolicy(session, digits, source) {
  if (!session?.callSid) {
    const reason = "missing_call_sid";
    emitDtmfEvent(session, { digits, status: "blocked", reason });
    throw new Error(reason);
  }
  if (!canSendDtmf(session)) {
    const reason = "policy";
    emitDtmfEvent(session, { digits, status: "blocked", reason });
    throw new Error(reason);
  }
  const now = Date.now();
  if (now - (session.lastDtmfAt || 0) < DTMF_COOLDOWN_MS) {
    const reason = "rate_limit";
    emitDtmfEvent(session, { digits, status: "blocked", reason });
    throw new Error(reason);
  }

  try {
    await sendDtmf({ client: twilioClient, callSid: session.callSid, digits });
    session.lastDtmfAt = now;
    emitDtmfEvent(session, { digits, status: "sent", reason: source });
    return true;
  } catch (error) {
    emitDtmfEvent(session, {
      digits,
      status: "failed",
      reason: error?.message || "send_failed"
    });
    throw error;
  }
}

const ivrController = createIvrController({
  emitIvrEvent,
  emitDtmfEvent,
  sendDtmf: (session, digits) => sendDtmfWithPolicy(session, digits, "ivr"),
  canSendDtmf
});

function mapVadAction(eventName) {
  if (!eventName) return null;
  const normalized = eventName.toLowerCase();
  if (normalized.includes("start")) return "start";
  if (normalized.includes("update")) return "update";
  if (normalized.includes("end")) return "end";
  return null;
}

app.post("/twiml", (req, res) => {
  console.log("[media-service] TwiML requested (legacy)");
  const xml = buildTwiml({
    publicBaseUrl: config.publicBaseUrl,
    mediaWsPath: config.mediaWsPath
  });
  res.type("text/xml").send(xml);
});

app.post("/twiml/outbound", (req, res) => {
  const { sessionId, confName } = req.query;
  console.log("[media-service] Outbound TwiML requested", { sessionId, confName });
  
  if (!sessionId || !confName) {
    return res.status(400).send("Missing sessionId or confName");
  }
  
  const xml = buildOutboundConferenceTwiml({
    publicBaseUrl: config.publicBaseUrl,
    mediaWsPath: config.mediaWsPath,
    sessionId,
    confName
  });
  
  res.type("text/xml").send(xml);
});

app.post("/twiml/webJoin", (req, res) => {
  // Twilio sends parameters in the body as form-urlencoded
  console.log("[media-service] Web join TwiML request body:", req.body);
  console.log("[media-service] Web join TwiML request query:", req.query);
  
  // sessionId can come from body (Twilio) or query (testing)
  const sessionId = req.body.sessionId || req.query.sessionId;
  console.log("[media-service] Web join TwiML requested", { sessionId });
  
  if (!sessionId) {
    console.warn("[media-service] Missing sessionId in webJoin request");
    return res.status(400).send("Missing sessionId");
  }
  
  const session = getSessionBySessionId(sessionId);
  if (!session) {
    console.warn("[media-service] Session not found:", sessionId);
    return res.status(404).send("Session not found");
  }
  
  console.log("[media-service] Found session for webJoin:", {
    sessionId: session.sessionId,
    confName: session.confName,
    state: session.state
  });
  
  const xml = buildWebJoinConferenceTwiml({
    confName: session.confName
  });
  
  console.log("[media-service] Returning webJoin TwiML:", xml);
  res.type("text/xml").send(xml);
});

app.post("/token", (req, res) => {
  try {
    const { identity, sessionId } = req.body;
    
    if (!identity) {
      return res.status(400).json({ error: "Missing identity" });
    }
    
    // Check if API credentials are configured
    if (!config.twilioApiKey || !config.twilioApiSecret || !config.twilioTwimlAppSid) {
      console.warn("[media-service] Twilio API credentials not configured for token generation");
      return res.status(501).json({ 
        error: "Token generation not configured. Please set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID" 
      });
    }
    
    const token = new AccessToken(
      config.twilioAccountSid,
      config.twilioApiKey,
      config.twilioApiSecret,
      { identity }
    );
    
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: config.twilioTwimlAppSid,
      incomingAllow: false
    });
    
    token.addGrant(voiceGrant);
    
    console.log("[media-service] Token generated for", identity);
    
    res.json({ 
      token: token.toJwt(),
      identity,
      sessionId
    });
  } catch (error) {
    console.error("[media-service] Token generation error", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/call/start", async (req, res) => {
  try {
    const sessionId = generateSessionId();
    const confName = generateConfName(sessionId);
    
    console.log("[media-service] Starting call", {
      to: config.fixedToNumber,
      from: config.twilioFromNumber,
      sessionId,
      confName
    });
    
    const call = await startCall({
      client: twilioClient,
      to: config.fixedToNumber,
      from: config.twilioFromNumber,
      twimlUrl: `${config.publicBaseUrl}/twiml/outbound?sessionId=${sessionId}&confName=${encodeURIComponent(confName)}`
    });
    
    console.log("[media-service] Call started", call.sid);
    activeCallSid = call.sid;
    
    // Create session preemptively
    const session = createSession({ 
      sessionId, 
      confName, 
      callSid: call.sid,
      streamSid: null 
    });
    ivrController.initSession(session);
    
    emitTwilio({
      callSid: call.sid,
      event: "twilio.call.start",
      data: { to: config.fixedToNumber, sessionId, confName },
      ts: 0
    });
    
    res.json({ ok: true, callSid: call.sid, sessionId, confName });
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

app.post("/call/dtmf", async (req, res) => {
  try {
    const { sessionId, callSid, digits } = req.body || {};
    const validationError = validateDigits(digits);
    if (validationError) {
      return res.status(400).json({ ok: false, error: `invalid_digits:${validationError}` });
    }

    const session =
      (sessionId ? getSessionBySessionId(sessionId) : null) ||
      (callSid ? getSessionByCallSid(callSid) : null);

    if (!session) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }

    await sendDtmfWithPolicy(session, digits, "manual");
    res.json({ ok: true });
  } catch (error) {
    const reason = error?.message || "send_failed";
    const status =
      reason === "policy"
        ? 403
        : reason === "rate_limit"
          ? 429
          : 500;
    res.status(status).json({ ok: false, error: reason });
  }
});

app.post("/ivr/next-digits", (req, res) => {
  const { sessionId, digits } = req.body || {};
  const validationError = validateDigits(digits);
  if (validationError) {
    return res.status(400).json({ ok: false, error: `invalid_digits:${validationError}` });
  }
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "missing_session_id" });
  }

  const session = getSessionBySessionId(sessionId);
  if (!session) {
    return res.status(404).json({ ok: false, error: "session_not_found" });
  }

  ivrController.setNextDigits(session, digits);
  res.json({ ok: true });
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
      const customParams = message.start.customParameters || {};
      const sessionId = customParams.session_id;
      
      console.log("[media-service] Media stream parameters", {
        streamSid,
        callSid,
        sessionId,
        customParams
      });
      
      // Try to get existing session or create new one
      let session = sessionId ? getSessionBySessionId(sessionId) : null;
      if (session) {
        // Update existing session with streamSid
        console.log("[media-service] Found existing session", {
          sessionId: session.sessionId,
          oldStreamSid: session.streamSid,
          newStreamSid: streamSid
        });
        
        // Update the session and re-index by streamSid
        session = updateSessionBySessionId(sessionId, {
          streamSid,
          state: 'IN_CALL'
        });
        ivrController.initSession(session);
        
        console.log("[media-service] ✓ Updated existing session", { 
          sessionId, 
          streamSid,
          confName: session.confName,
          state: session.state
        });
      } else {
        // Create new session (fallback for legacy flow)
        console.log("[media-service] Creating new session (legacy fallback)");
        session = createSession({ streamSid, callSid });
        ivrController.initSession(session);
      }
      if (config.usePythonVad && audioAiClient) {
        // Initialize reconnect state for this session
        if (!session.grpcReconnectState) {
          session.grpcReconnectState = {
            retryCount: 0,
            maxRetries: 2,  // Maximum 2 retry attempts
            baseDelay: 2000,  // Start with 2 seconds
            maxDelay: 10000,  // Max 10 seconds between retries
            isReconnecting: false
          };
        }
        
        // Helper function to create gRPC stream
        const createGrpcStream = () => {
          console.log(`[media-service] Creating gRPC stream for session ${sessionId || streamSid}`);
          const grpcStream = audioAiClient.Stream();
          
          grpcStream.on("data", (event) => {
            // Reset retry count on successful data reception
            if (session.grpcReconnectState) {
              session.grpcReconnectState.retryCount = 0;
            }
            const action = mapVadAction(event.event);
            if (!action) return;
            
            // Extract music_prob (gRPC uses snake_case due to keepCase: true)
            // Check both snake_case and camelCase for compatibility
            const musicProb = (event.music_prob !== undefined && event.music_prob !== null) 
              ? event.music_prob 
              : (event.musicProb !== undefined && event.musicProb !== null)
                ? event.musicProb
                : 0.0;
            
            // Debug: log all event fields for first few events and when music is detected
            if (!session._vadEventCount) {
              session._vadEventCount = 0;
            }
            session._vadEventCount++;
            
            if (musicProb > 0.1 || session._vadEventCount <= 10) {
              console.log(`[media-service] VAD event #${session._vadEventCount}: action=${action}, prob=${event.prob}, music_prob=${musicProb}, has_music_prob=${event.music_prob !== undefined}, has_musicProb=${event.musicProb !== undefined}, all_fields=${Object.keys(event).join(',')}, event_obj=${JSON.stringify(event)}`);
            }
            
            emitVad({
              session,
              action,
              prob: event.prob ?? 0.8,
              track: event.track || "inbound",
              musicProb: musicProb
            });
          });
          
          grpcStream.on("error", (error) => {
            console.error(`[media-service] gRPC stream error ${error.code || ''} ${error.message}`);
            // Mark stream as invalid
            if (session.grpcStream === grpcStream) {
              session.grpcStream = null;
            }
            
            // Only attempt reconnect if we haven't exceeded max retries
            if (session.grpcReconnectState && session.grpcReconnectState.retryCount < session.grpcReconnectState.maxRetries) {
              attemptReconnect();
            } else {
              console.warn(`[media-service] Not attempting reconnect - max retries (${session.grpcReconnectState?.maxRetries || 'unknown'}) already reached`);
            }
          });
          
          grpcStream.on("end", () => {
            console.log("[media-service] gRPC stream ended");
            // Mark stream as invalid
            if (session.grpcStream === grpcStream) {
              session.grpcStream = null;
            }
            
            // Only attempt reconnect if we haven't exceeded max retries
            if (session.grpcReconnectState && session.grpcReconnectState.retryCount < session.grpcReconnectState.maxRetries) {
              attemptReconnect();
            } else {
              console.warn(`[media-service] Not attempting reconnect - max retries (${session.grpcReconnectState?.maxRetries || 'unknown'}) already reached`);
            }
          });
          
          return grpcStream;
        };
        
        // Reconnect helper with exponential backoff
        const attemptReconnect = () => {
          if (!session || !session.grpcReconnectState) return;
          
          const state = session.grpcReconnectState;
          
          // Check if we've exceeded max retries
          if (state.retryCount >= state.maxRetries) {
            if (!state.hasLoggedMaxRetries) {
              console.warn(`[media-service] Max reconnection attempts (${state.maxRetries}) reached for session ${sessionId || streamSid}. Stopping reconnection attempts.`);
              state.hasLoggedMaxRetries = true;
            }
            return;
          }
          
          // Prevent multiple simultaneous reconnection attempts
          if (state.isReconnecting) {
            return;
          }
          
          state.isReconnecting = true;
          state.retryCount++;
          
          // Calculate exponential backoff delay
          const delay = Math.min(
            state.baseDelay * Math.pow(2, state.retryCount - 1),
            state.maxDelay
          );
          
          console.log(`[media-service] Attempting to reconnect gRPC stream for session ${sessionId || streamSid} (attempt ${state.retryCount}/${state.maxRetries}, delay ${delay}ms)`);
          
          setTimeout(() => {
            state.isReconnecting = false;
            if (session && !session.grpcStream && config.usePythonVad && audioAiClient) {
              try {
                session.grpcStream = createGrpcStream();
              } catch (error) {
                console.error(`[media-service] Failed to create gRPC stream: ${error.message}`);
                // Will retry on next attempt
              }
            }
          }, delay);
        };
        
        session.grpcStream = createGrpcStream();
        console.log(`[media-service] gRPC stream created for ${sessionId || streamSid}`);
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
      if (!session) {
        console.warn(`[media-service] Received media but no session found for streamSid: ${streamSid}`);
        return;
      }
      session.lastAudioAt = Date.now();
      
      // Ensure gRPC stream exists, recreate if needed
      if (config.usePythonVad && audioAiClient) {
        if (!session.grpcStream) {
          // Initialize reconnect state if not exists
          if (!session.grpcReconnectState) {
            session.grpcReconnectState = {
              retryCount: 0,
              maxRetries: 2,
              baseDelay: 2000,
              maxDelay: 10000,
              isReconnecting: false
            };
          }
          
          const state = session.grpcReconnectState;
          
          // Check if we've exceeded max retries - if so, stop trying completely
          if (state.retryCount >= state.maxRetries) {
            // Only log once per session
            if (!state.hasLoggedMaxRetries) {
              console.warn(`[media-service] gRPC stream missing for session ${streamSid}, but max retries (${state.maxRetries}) reached. Stopping all reconnection attempts.`);
              state.hasLoggedMaxRetries = true;
            }
            return; // Don't try to create stream if max retries exceeded
          }
          
          // Don't recreate if already reconnecting
          if (state.isReconnecting) {
            return;
          }
          
          console.log(`[media-service] gRPC stream missing, recreating for session ${streamSid}`);
          
          // Recreate gRPC stream helper function
          const createGrpcStream = () => {
            const grpcStream = audioAiClient.Stream();
            
            grpcStream.on("data", (event) => {
              // Reset retry count on successful data reception
              if (session.grpcReconnectState) {
                session.grpcReconnectState.retryCount = 0;
                session.grpcReconnectState.hasLoggedMaxRetries = false;
              }
              const action = mapVadAction(event.event);
              if (!action) return;
              emitVad({
                session,
                action,
                prob: event.prob ?? 0.8,
                track: event.track || "inbound"
              });
            });
            
            grpcStream.on("error", (error) => {
              console.error(`[media-service] gRPC stream error ${error.code || ''} ${error.message}`);
              if (session.grpcStream === grpcStream) {
                session.grpcStream = null;
              }
              // Only attempt reconnect if we haven't exceeded max retries
              if (session.grpcReconnectState && session.grpcReconnectState.retryCount < session.grpcReconnectState.maxRetries) {
                attemptReconnect();
              } else {
                console.warn(`[media-service] Not attempting reconnect - max retries (${session.grpcReconnectState?.maxRetries || 'unknown'}) already reached`);
              }
            });
            
            grpcStream.on("end", () => {
              console.log("[media-service] gRPC stream ended");
              if (session.grpcStream === grpcStream) {
                session.grpcStream = null;
              }
              // Only attempt reconnect if we haven't exceeded max retries
              if (session.grpcReconnectState && session.grpcReconnectState.retryCount < session.grpcReconnectState.maxRetries) {
                attemptReconnect();
              } else {
                console.warn(`[media-service] Not attempting reconnect - max retries (${session.grpcReconnectState?.maxRetries || 'unknown'}) already reached`);
              }
            });
            
            return grpcStream;
          };
          
          // Reconnect helper with exponential backoff
          const attemptReconnect = () => {
            if (!session || !session.grpcReconnectState) return;
            
            const reconnectState = session.grpcReconnectState;
            
            if (reconnectState.retryCount >= reconnectState.maxRetries) {
              if (!reconnectState.hasLoggedMaxRetries) {
                console.warn(`[media-service] Max reconnection attempts (${reconnectState.maxRetries}) reached for session ${streamSid}. Stopping reconnection attempts.`);
                reconnectState.hasLoggedMaxRetries = true;
              }
              return;
            }
            
            if (reconnectState.isReconnecting) {
              return;
            }
            
            reconnectState.isReconnecting = true;
            reconnectState.retryCount++;
            
            const delay = Math.min(
              reconnectState.baseDelay * Math.pow(2, reconnectState.retryCount - 1),
              reconnectState.maxDelay
            );
            
            console.log(`[media-service] Scheduling reconnect for session ${streamSid} (attempt ${reconnectState.retryCount}/${reconnectState.maxRetries}, delay ${delay}ms)`);
            
            setTimeout(() => {
              reconnectState.isReconnecting = false;
              if (session && !session.grpcStream && config.usePythonVad && audioAiClient) {
                try {
                  session.grpcStream = createGrpcStream();
                } catch (error) {
                  console.error(`[media-service] Failed to create gRPC stream: ${error.message}`);
                }
              }
            }, delay);
          };
          
          session.grpcStream = createGrpcStream();
        }
        
        if (session.grpcStream) {
          session.seq = (session.seq || 0) + 1;
          const payload = Buffer.from(message.media.payload, "base64");
          
          // Get track from Twilio message (if available)
          // Twilio Media Streams: "inbound" = remote speaker (PSTN), "outbound" = local mic
          // For outbound PSTN call: we want "inbound" (what PSTN caller is saying)
          const twilioTrack = message.media.track || "inbound";
          
          // Track statistics (minimal logging)
          if (!session.trackStats) {
            session.trackStats = { inbound: 0, outbound: 0, unknown: 0 };
          }
          session.trackStats[twilioTrack] = (session.trackStats[twilioTrack] || 0) + 1;
          
          // Log track distribution only every 1000 chunks (reduced frequency)
          if (session.seq % 1000 === 0) {
            console.log(`[media-service] Track stats: ${JSON.stringify(session.trackStats)}`);
          }
          
          // Only process "inbound" track (remote speaker) for VAD
          // "outbound" track would be our own mic, which we don't need to analyze
          if (twilioTrack !== "inbound") {
            // Skip outbound audio (our own mic)
            if (session.seq <= 10) {
              console.log(`[media-service] Skipping ${twilioTrack} track (we only process inbound)`);
            }
            return;
          }
          
          const audioChunk = {
            session_id: streamSid,
            seq: session.seq,
            codec: "MULAW_8K",
            payload: payload,
            timestamp_ms: Date.now() - session.callStartAt,
            track: "inbound"  // Remote speaker (PSTN caller)
          };
          
          try {
            session.grpcStream.write(audioChunk);
          } catch (error) {
            console.error("[media-service] Error writing to gRPC stream:", error);
            // Mark stream as invalid so it will be recreated on next media event
            session.grpcStream = null;
          }
        }
      } else {
        if (!session.vadMock) {
          console.warn(`[media-service] No gRPC stream or VAD mock for session ${streamSid}`);
        }
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
      if (session?.sessionId) {
        ivrController.cleanupSession(session.sessionId);
      }
      deleteSession(streamSid);
    }
  });
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`media-service listening on ${config.port}`);
});
