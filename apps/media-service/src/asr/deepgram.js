const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");

// Map: sessionId -> Deepgram live connection
const sessionConnections = new Map();

/**
 * Create and initialize a Deepgram live transcription connection.
 * @param {string} sessionId - Session identifier.
 * @param {string} apiKey - Deepgram API Key
 * @param {object} config - Runtime ASR options (model, language, utteranceEndMs).
 * @param {function} onPartial - Callback for interim transcripts.
 * @param {function} onFinal - Callback for final transcripts.
 * @param {function} onError - Callback for connection/runtime errors.
 * @returns {Promise<object>} Connected Deepgram live connection.
 */
async function createConnection(sessionId, apiKey, config = {}, callbacks = {}) {
  const { onPartial, onFinal, onError, onMetadata, onClose } = callbacks;

  // Close and replace any previous connection for the same session.
  if (sessionConnections.has(sessionId)) {
    console.log(`[Deepgram] Closing existing connection for session ${sessionId}`);
    await closeConnection(sessionId);
  }

  try {
    const deepgram = createClient(apiKey);
    
    const connection = deepgram.listen.live({
      model: config.model || "nova-2",
      language: config.language || "en-US",
      smart_format: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: config.utteranceEndMs || 1000,
      vad_events: false,
      encoding: "mulaw",
      sample_rate: 8000,
      channels: 1,
    });

    // Wait until the websocket is open (or fail on timeout/error).
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Deepgram connection timeout"));
      }, 10000);

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log(`[Deepgram] Connection opened for session ${sessionId}`);
        clearTimeout(timeout);
        resolve();
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error(`[Deepgram] Connection error for session ${sessionId}:`, error);
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Register transcript callback handlers.
    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0];
      if (!transcript) return;

      const isFinal = data.is_final || false;
      const text = transcript.transcript;
      
      if (!text || text.trim().length === 0) return;

      const eventData = {
        sessionId,
        text: text.trim(),
        confidence: transcript.confidence || 0,
        isFinal,
        timestamp: Date.now(),
      };

      if (isFinal && onFinal) {
        onFinal(eventData);
      } else if (!isFinal && onPartial) {
        onPartial(eventData);
      }
    });

    connection.on(LiveTranscriptionEvents.Metadata, (data) => {
      if (onMetadata) {
        onMetadata({ sessionId, metadata: data });
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error(`[Deepgram] Error for session ${sessionId}:`, error);
      if (onError) {
        onError({ sessionId, error });
      }
    });

    connection.on(LiveTranscriptionEvents.Close, (closeEvent) => {
      const code = closeEvent?.code || closeEvent;
      const reason = closeEvent?.reason || "";
      console.log(`[Deepgram] Connection closed for session ${sessionId}, code=${code}, reason=${reason || "none"}`);
      
      // Only delete from Map if this connection is still the active one for this session
      // This prevents race conditions where old connection's Close event deletes new connection
      const currentConnection = sessionConnections.get(sessionId);
      if (currentConnection === connection) {
        sessionConnections.delete(sessionId);
        if (onClose) {
          onClose({ sessionId, code, reason });
        }
      } else {
        console.log(`[Deepgram] Ignoring Close event for replaced connection ${sessionId}`);
      }
    });

    // Store as the active connection for this session.
    sessionConnections.set(sessionId, connection);

    return connection;
  } catch (error) {
    console.error(`[Deepgram] Failed to create connection for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Send encoded audio payload to Deepgram.
 * @param {string} sessionId - Session identifier.
 * @param {Buffer} audioBuffer - Audio payload (μ-law, 8kHz).
 */
const noConnectionWarnAt = new Map();
function sendAudio(sessionId, audioBuffer) {
  const connection = sessionConnections.get(sessionId);
  if (!connection) {
    const now = Date.now();
    const lastWarn = noConnectionWarnAt.get(sessionId) || 0;
    if (now - lastWarn > 5000) {
      console.warn(`[Deepgram] No connection found for session ${sessionId}`);
      noConnectionWarnAt.set(sessionId, now);
    }
    return false;
  }

  try {
    connection.send(audioBuffer);
    return true;
  } catch (error) {
    console.error(`[Deepgram] Error sending audio for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Close the active Deepgram connection for a session.
 * @param {string} sessionId - Session identifier.
 */
async function closeConnection(sessionId) {
  const connection = sessionConnections.get(sessionId);
  if (!connection) {
    return;
  }

  try {
    console.log(`[Deepgram] Closing connection for session ${sessionId}`);
    connection.finish();
    sessionConnections.delete(sessionId);
  } catch (error) {
    console.error(`[Deepgram] Error closing connection for session ${sessionId}:`, error);
  }
}

/** Return number of currently active Deepgram connections. */
function getActiveConnectionCount() {
  return sessionConnections.size;
}

/** Check whether a session currently has an active connection. */
function hasConnection(sessionId) {
  return sessionConnections.has(sessionId);
}

module.exports = {
  createConnection,
  sendAudio,
  closeConnection,
  getActiveConnectionCount,
  hasConnection,
};
