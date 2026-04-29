const { twiml } = require("twilio");

/**
 * Build TwiML for outbound PSTN leg joining conference with Media Stream
 * 
 * NOTE: endConferenceOnExit is set to false to allow DTMF sending without
 * terminating the conference. When DTMF is sent via TwiML update, the PSTN
 * leg temporarily leaves the conference then rejoins. If endConferenceOnExit
 * were true, this would kick out the web participant.
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
  
  // Join conference with status callbacks for debugging
  // endConferenceOnExit: false - allows PSTN leg to leave/rejoin for DTMF without ending conference
  // Note: Don't use Dial action as it expects TwiML response when dial ends
  const dial = response.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    statusCallback: `${publicBaseUrl}/status/conference`,
    statusCallbackEvent: 'start end join leave mute hold'
  }, confName);
  
  return response.toString();
}

/**
 * Build TwiML for web user joining conference
 */
function buildWebJoinConferenceTwiml({ confName, publicBaseUrl }) {
  const response = new twiml.VoiceResponse();
  
  // Note: Don't use Dial action as it expects TwiML response when dial ends
  const dial = response.dial();
  
  const confOptions = {
    startConferenceOnEnter: false,
    endConferenceOnExit: false
  };
  
  if (publicBaseUrl) {
    confOptions.statusCallback = `${publicBaseUrl}/status/conference`;
    confOptions.statusCallbackEvent = 'start end join leave mute hold';
  }
  
  dial.conference(confOptions, confName);
  
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

/**
 * Build TwiML for playing DTMF then rejoining conference
 * This is used when sending DTMF via calls.update() - we redirect to this endpoint
 * which plays the DTMF and then redirects back to the conference
 */
function buildDtmfTwiml({ publicBaseUrl, mediaWsPath, sessionId, confName, digits }) {
  const response = new twiml.VoiceResponse();
  const wsUrl = publicBaseUrl.replace(/^http/, "ws") + mediaWsPath;
  
  // Play DTMF digits
  response.play({ digits });
  
  // Restart Media Stream
  const start = response.start();
  const stream = start.stream({ url: wsUrl });
  stream.parameter({ name: "session_id", value: sessionId });
  stream.parameter({ name: "role", value: "pstn" });
  
  // Rejoin conference
  const dial = response.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    statusCallback: `${publicBaseUrl}/status/conference`,
    statusCallbackEvent: 'start end join leave mute hold'
  }, confName);
  
  return response.toString();
}

module.exports = {
  buildTwiml,
  buildOutboundConferenceTwiml,
  buildWebJoinConferenceTwiml,
  buildDtmfTwiml
};
