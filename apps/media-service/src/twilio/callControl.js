const twilio = require("twilio");

function createTwilioClient({ twilioAccountSid, twilioAuthToken }) {
  return twilio(twilioAccountSid, twilioAuthToken);
}

async function startCall({ client, to, from, twimlUrl }) {
  return client.calls.create({
    to,
    from,
    url: twimlUrl
  });
}

async function hangupCall({ client, callSid }) {
  return client.calls(callSid).update({ status: "completed" });
}

module.exports = {
  createTwilioClient,
  startCall,
  hangupCall
};
