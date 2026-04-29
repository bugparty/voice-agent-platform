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

/**
 * Send DTMF tones on an active call
 * 
 * IMPORTANT: When sending DTMF via update(), Twilio replaces the current TwiML.
 * We use url parameter instead of twiml to let Twilio fetch the TwiML,
 * which is more reliable than inline TwiML with Redirect.
 * 
 * @param {Object} params
 * @param {Object} params.client - Twilio client
 * @param {string} params.callSid - Call SID to send DTMF on
 * @param {string} params.digits - DTMF digits to send
 * @param {string} [params.dtmfUrl] - URL that returns TwiML for DTMF + rejoin conference
 */
async function sendDtmf({ client, callSid, digits, dtmfUrl }) {
  console.log(`[callControl] sendDtmf: callSid=${callSid}, digits=${digits}, dtmfUrl=${dtmfUrl || 'none'}`);
  try {
    let updateParams;
    
    if (dtmfUrl) {
      // Use URL parameter - Twilio will fetch TwiML from this URL
      // This is more reliable than inline TwiML as Twilio validates the URL first
      console.log(`[callControl] sendDtmf using url parameter: ${dtmfUrl}`);
      updateParams = {
        url: dtmfUrl,
        method: 'POST'
      };
    } else {
      // Fallback: just play digits (WARNING: this will end the media stream!)
      console.warn('[callControl] sendDtmf called without dtmfUrl - media stream will be interrupted!');
      updateParams = {
        twiml: `<Response><Play digits="${digits}"/></Response>`
      };
    }
    
    const result = await client.calls(callSid).update(updateParams);
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
