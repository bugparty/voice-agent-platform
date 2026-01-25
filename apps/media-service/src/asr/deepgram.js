const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");

// 会话 → Deepgram 连接映射
const sessionConnections = new Map();

/**
 * 创建 Deepgram 实时转写连接
 * @param {string} sessionId - 会话ID
 * @param {string} apiKey - Deepgram API Key
 * @param {object} config - 配置选项
 * @param {function} onPartial - 接收部分转写的回调
 * @param {function} onFinal - 接收最终转写的回调
 * @param {function} onError - 错误回调
 * @returns {Promise<object>} 返回连接对象
 */
async function createConnection(sessionId, apiKey, config = {}, callbacks = {}) {
  const { onPartial, onFinal, onError, onMetadata, onClose } = callbacks;

  // 如果已存在连接，先关闭
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

    // 等待连接打开
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

    // 设置事件监听器
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

    // 保存连接
    sessionConnections.set(sessionId, connection);

    return connection;
  } catch (error) {
    console.error(`[Deepgram] Failed to create connection for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * 发送音频数据到 Deepgram
 * @param {string} sessionId - 会话ID
 * @param {Buffer} audioBuffer - 音频数据 (μ-law)
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
 * 关闭 Deepgram 连接
 * @param {string} sessionId - 会话ID
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

/**
 * 获取当前活动连接数
 */
function getActiveConnectionCount() {
  return sessionConnections.size;
}

/**
 * 检查会话是否有活动连接
 */
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
