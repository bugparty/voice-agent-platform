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

async function sendDtmf({ client, callSid, digits }) {
  return client.calls(callSid).update({
    twiml: `<Response><Play digits="${digits}"/></Response>`
  });
}

module.exports = {
  createTwilioClient,
  startCall,
  hangupCall,
  sendDtmf
};
