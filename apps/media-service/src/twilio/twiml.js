const { twiml } = require("twilio");

/**
 * Build TwiML for outbound PSTN leg joining conference with Media Stream
 */
function buildOutboundConferenceTwiml({ publicBaseUrl, mediaWsPath, sessionId, confName }) {
  const response = new twiml.VoiceResponse();
  const wsUrl = publicBaseUrl.replace(/^http/, "ws") + mediaWsPath;
  
  // Start Media Stream on the PSTN leg before joining conference
  // This captures the PSTN leg's audio (both inbound and outbound tracks)
  // We filter for "inbound" track in Node.js to get the remote caller's audio
  const start = response.start();
  const stream = start.stream({ url: wsUrl });
  stream.parameter({ name: "session_id", value: sessionId });
  stream.parameter({ name: "role", value: "pstn" });
  
  // Join conference
  const dial = response.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: true
  }, confName);
  
  return response.toString();
}

/**
 * Build TwiML for web user joining conference
 */
function buildWebJoinConferenceTwiml({ confName }) {
  const response = new twiml.VoiceResponse();
  
  const dial = response.dial();
  dial.conference({
    startConferenceOnEnter: false,
    endConferenceOnExit: false
  }, confName);
  
  return response.toString();
}

/**
 * Legacy TwiML builder (kept for backward compatibility)
 */
function buildTwiml({ publicBaseUrl, mediaWsPath }) {
  const response = new twiml.VoiceResponse();
  const wsUrl = publicBaseUrl.replace(/^http/, "ws") + mediaWsPath;
  response.start().stream({ url: wsUrl });
  response.pause({ length: 60 });
  response.redirect({ method: "POST" }, `${publicBaseUrl}/twiml`);
  return response.toString();
}

module.exports = {
  buildTwiml,
  buildOutboundConferenceTwiml,
  buildWebJoinConferenceTwiml
};
