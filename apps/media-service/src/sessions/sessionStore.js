const sessionsByStreamSid = new Map();
const sessionsByCallSid = new Map();
const sessionsBySessionId = new Map();

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateConfName(sessionId) {
  return `conf_${sessionId}`;
}

function createSession({ streamSid, callSid, sessionId, confName }) {
  const id = sessionId || generateSessionId();
  const conf = confName || generateConfName(id);
  
  const session = {
    sessionId: id,
    confName: conf,
    streamSid,
    callSid,
    webCallSid: null,
    state: 'CALLING',
    phase: "IVR",
    createdAt: Date.now(),
    callStartAt: Date.now(),
    lastAudioAt: null,
    lastDtmfAt: 0,
    vadMock: null,
    grpcStream: null,
    seq: 0,
    ivrConfig: {
      promptTimeoutMs: 4000,
      responseTimeoutMs: 6000,
      retryDelayMs: 1500,
      maxRetries: 2
    },
    ivr: {
      state: "idle",
      pendingDigits: null,
      lastDigits: null,
      attempts: 0,
      lastPromptAt: null,
      lastVadEndAt: null
    }
  };
  
  // Always store by sessionId
  sessionsBySessionId.set(id, session);
  
  // Store by streamSid if available
  if (streamSid) {
    sessionsByStreamSid.set(streamSid, session);
  }
  
  // Store by callSid if available
  if (callSid) {
    sessionsByCallSid.set(callSid, session);
  }
  
  return session;
}

function getSession(streamSid) {
  return sessionsByStreamSid.get(streamSid);
}

function getSessionByCallSid(callSid) {
  return sessionsByCallSid.get(callSid);
}

function getSessionBySessionId(sessionId) {
  return sessionsBySessionId.get(sessionId);
}

function updateSession(streamSid, updates) {
  const session = sessionsByStreamSid.get(streamSid);
  if (!session) return null;
  
  // If updating streamSid, update the index
  if (updates.streamSid && updates.streamSid !== session.streamSid) {
    if (session.streamSid) {
      sessionsByStreamSid.delete(session.streamSid);
    }
    sessionsByStreamSid.set(updates.streamSid, session);
  }
  
  // If updating callSid, update the index
  if (updates.callSid && updates.callSid !== session.callSid) {
    if (session.callSid) {
      sessionsByCallSid.delete(session.callSid);
    }
    sessionsByCallSid.set(updates.callSid, session);
  }
  
  Object.assign(session, updates);
  return session;
}

function updateSessionBySessionId(sessionId, updates) {
  const session = sessionsBySessionId.get(sessionId);
  if (!session) return null;
  
  // If updating streamSid, update the index
  // Keep old streamSid mapped so in-flight media doesn't become "no session"
  if (updates.streamSid && updates.streamSid !== session.streamSid) {
    sessionsByStreamSid.set(updates.streamSid, session);
  }
  
  // If updating callSid, update the index
  if (updates.callSid && updates.callSid !== session.callSid) {
    if (session.callSid) {
      sessionsByCallSid.delete(session.callSid);
    }
    sessionsByCallSid.set(updates.callSid, session);
  }
  
  Object.assign(session, updates);
  return session;
}

/**
 * Remove streamSid index but keep session by sessionId and callSid
 * This is used when media stream stops but call may continue (e.g., DTMF scenario)
 */
function detachStreamSid(streamSid) {
  const session = sessionsByStreamSid.get(streamSid);
  if (session) {
    sessionsByStreamSid.delete(streamSid);
    if (session.streamSid === streamSid) {
      session.streamSid = null;
    }
    return session;
  }
  return null;
}

/**
 * Completely delete a session from all indices
 * Use this only when the call is truly ended
 */
function deleteSession(streamSid) {
  const session = sessionsByStreamSid.get(streamSid);
  if (session) {
    // Delete from all indices
    if (session.streamSid) {
      sessionsByStreamSid.delete(session.streamSid);
    }
    if (session.callSid) {
      sessionsByCallSid.delete(session.callSid);
    }
    if (session.sessionId) {
      sessionsBySessionId.delete(session.sessionId);
    }
  }
}

/**
 * Delete session by sessionId - for complete cleanup
 */
function deleteSessionBySessionId(sessionId) {
  const session = sessionsBySessionId.get(sessionId);
  if (session) {
    if (session.streamSid) {
      sessionsByStreamSid.delete(session.streamSid);
    }
    if (session.callSid) {
      sessionsByCallSid.delete(session.callSid);
    }
    sessionsBySessionId.delete(sessionId);
  }
}

module.exports = {
  createSession,
  getSession,
  getSessionByCallSid,
  getSessionBySessionId,
  updateSession,
  updateSessionBySessionId,
  detachStreamSid,
  deleteSession,
  deleteSessionBySessionId,
  generateSessionId,
  generateConfName
};
