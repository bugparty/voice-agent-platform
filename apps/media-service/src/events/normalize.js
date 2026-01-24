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

function vadEvent({ ts, source, action, prob }) {
  return buildEvent({
    category: "VAD",
    payload: {
      source,
      event: `vad.${source}.${action}`,
      prob
    },
    ts
  });
}

module.exports = {
  buildEvent,
  twilioEvent,
  vadEvent
};
