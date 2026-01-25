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
  console.log(`[callControl] sendDtmf: callSid=${callSid}, digits=${digits}`);
  try {
    const result = await client.calls(callSid).update({
      twiml: `<Response><Play digits="${digits}"/></Response>`
    });
    console.log(`[callControl] sendDtmf success: status=${result.status}`);
    return result;
  } catch (error) {
    console.error(`[callControl] sendDtmf failed: ${error.message}`, error.code || '');
    throw error;
  }
}

module.exports = {
  createTwilioClient,
  startCall,
  hangupCall,
  sendDtmf
};
