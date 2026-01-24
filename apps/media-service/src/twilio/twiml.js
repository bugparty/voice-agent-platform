const { twiml } = require("twilio");

function buildTwiml({ publicBaseUrl, mediaWsPath }) {
  const response = new twiml.VoiceResponse();
  const wsUrl = publicBaseUrl.replace(/^http/, "ws") + mediaWsPath;
  response.start().stream({ url: wsUrl });
  response.pause({ length: 60 });
  response.redirect({ method: "POST" }, `${publicBaseUrl}/twiml`);
  return response.toString();
}

module.exports = {
  buildTwiml
};
