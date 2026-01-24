const sessions = new Map();

function createSession({ streamSid, callSid }) {
  const session = {
    streamSid,
    callSid,
    createdAt: Date.now(),
    callStartAt: Date.now(),
    lastAudioAt: null,
    vadMock: null,
    grpcStream: null,
    seq: 0
  };
  sessions.set(streamSid, session);
  return session;
}

function getSession(streamSid) {
  return sessions.get(streamSid);
}

function updateSession(streamSid, updates) {
  const session = sessions.get(streamSid);
  if (!session) return null;
  Object.assign(session, updates);
  return session;
}

function deleteSession(streamSid) {
  sessions.delete(streamSid);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession
};
