const { randomUUID } = require("crypto");

function buildEvent({ category, level = "INFO", payload, ts }) {
  return {
    id: randomUUID(),
    ts,
    category,
    level,
    payload
  };
}

function twilioEvent({ ts, callSid, streamSid, event, data }) {
  return buildEvent({
    category: "TWILIO",
    payload: {
      callSid,
      streamSid,
      event,
      data
    },
    ts
  });
}

function vadEvent({ ts, source, action, prob, musicProb }) {
  const event = buildEvent({
    category: "VAD",
    payload: {
      source,
      event: `vad.${source}.${action}`,
      prob,
      musicProb: musicProb ?? 0.0
    },
    ts
  });
  
  // Debug: log music events (reduced frequency)
  // if ((musicProb ?? 0) > 0.3) {
  //   console.log(`[normalize] VAD event with music: musicProb=${musicProb}`);
  // }
  
  return event;
}

function conferenceEvent({ ts, sessionId, confName, event, data }) {
  return buildEvent({
    category: "CONFERENCE",
    payload: {
      sessionId,
      confName,
      event: `conference.${event}`,
      data
    },
    ts
  });
}

function asrEvent({ ts, sessionId, text, confidence, isFinal, track = "remote" }) {
  return buildEvent({
    category: "ASR",
    payload: {
      sessionId,
      event: isFinal ? `asr.${track}.final` : `asr.${track}.partial`,
      text,
      confidence,
      isFinal,
      track
    },
    ts
  });
}
function dtmfEvent({ ts, sessionId, callSid, digits, status, reason }) {
  return buildEvent({
    category: "DTMF",
    payload: {
      sessionId,
      callSid,
      event: `dtmf.${status}`,
      digits,
      reason
    },
    ts
  });
}

function ivrEvent({ ts, sessionId, state, detail }) {
  return buildEvent({
    category: "IVR",
    payload: {
      sessionId,
      event: `ivr.${state}`,
      detail
    },
    ts
  });
}

module.exports = {
  buildEvent,
  twilioEvent,
  vadEvent,
  conferenceEvent,
  asrEvent,
  dtmfEvent,
  ivrEvent
};
