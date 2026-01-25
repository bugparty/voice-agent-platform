const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

// 会话 → Agent 流映射
const sessionStreams = new Map();

// 会话 → 订阅过滤器映射
const sessionFilters = new Map();

// Special key for "all sessions" subscriptions
const ALL_SESSIONS_KEY = "__all__";

let agentProto = null;
let server = null;

/**
 * 检查事件类型是否匹配订阅过滤器
 * @param {string} eventType - 事件类型，如 "vad.remote.start"
 * @param {string[]} filters - 订阅过滤器，如 ["vad.*", "asr.*"]
 */
function matchesFilter(eventType, filters) {
  if (!filters || filters.length === 0) return true;
  
  return filters.some(filter => {
    if (filter === "*") return true;
    if (filter.endsWith(".*")) {
      const prefix = filter.slice(0, -2);
      return eventType.startsWith(prefix + ".");
    }
    return eventType === filter;
  });
}

/**
 * 实现 Subscribe RPC
 * Agent 通过这个双向流订阅事件，并可以发送建议
 */
function subscribeHandler(call) {
  let sessionId = null;
  let eventTypes = [];

  console.log("[AgentServer] New agent connection");

  // 接收来自 Agent 的消息
  call.on("data", (agentMessage) => {
    try {
      if (agentMessage.subscribe) {
        // 处理订阅请求
        const requestedSessionId = agentMessage.subscribe.session_id || agentMessage.session_id;
        eventTypes = agentMessage.subscribe.event_types || [];
        const wantsAllSessions =
          !requestedSessionId ||
          requestedSessionId === "*" ||
          requestedSessionId === "all";

        sessionId = wantsAllSessions ? ALL_SESSIONS_KEY : requestedSessionId;

        const sessionLabel = wantsAllSessions ? "ALL_SESSIONS" : sessionId;
        console.log(`[AgentServer] Agent subscribed to session ${sessionLabel}, filters: ${eventTypes.join(", ")}`);
        
        // 保存流和过滤器
        sessionStreams.set(sessionId, call);
        sessionFilters.set(sessionId, eventTypes);
        
        // 发送确认消息 (可选)
        call.write({
          session_id: requestedSessionId || "*",
          timestamp_ms: Date.now(),
          event_type: "agent.subscription.confirmed",
          call: {
            status: "subscribed",
            call_sid: requestedSessionId || "*",
          },
        });
      } else if (agentMessage.suggestion) {
        // 处理 Agent 建议
        const suggestion = agentMessage.suggestion;
        sessionId = agentMessage.session_id;
        
        console.log(`[AgentServer] Received suggestion from agent for session ${sessionId}:`, {
          suggestionId: suggestion.suggestion_id,
          plan: suggestion.plan,
          actionCount: suggestion.actions?.length || 0,
          confidence: suggestion.confidence,
        });
        
        // 触发建议处理事件
        if (server && server._suggestionCallback) {
          server._suggestionCallback({
            sessionId,
            suggestion,
          });
        }
      }
    } catch (error) {
      console.error("[AgentServer] Error processing agent message:", error);
    }
  });

  call.on("end", () => {
    if (sessionId) {
      console.log(`[AgentServer] Agent disconnected from session ${sessionId}`);
      sessionStreams.delete(sessionId);
      sessionFilters.delete(sessionId);
    }
    call.end();
  });

  call.on("error", (error) => {
    if (sessionId) {
      console.error(`[AgentServer] Stream error for session ${sessionId}:`, error);
      sessionStreams.delete(sessionId);
      sessionFilters.delete(sessionId);
    }
  });

  call.on("cancelled", () => {
    if (sessionId) {
      console.log(`[AgentServer] Stream cancelled for session ${sessionId}`);
      sessionStreams.delete(sessionId);
      sessionFilters.delete(sessionId);
    }
  });
}

/**
 * 推送事件到已订阅的 Agent
 * @param {string} sessionId - 会话ID
 * @param {object} event - 事件对象
 */
function pushEvent(sessionId, event) {
  const eventType = event.type || event.event_type || "";
  const targetKeys = sessionId === ALL_SESSIONS_KEY
    ? [ALL_SESSIONS_KEY]
    : [sessionId, ALL_SESSIONS_KEY];

  let delivered = false;

  for (const key of targetKeys) {
    const stream = sessionStreams.get(key);
    if (!stream) continue;

    const filters = sessionFilters.get(key);
    // 检查事件是否匹配过滤器
    if (!matchesFilter(eventType, filters)) {
      continue;
    }

    try {
      // 转换事件格式为 Proto 格式 (始终使用真实 sessionId)
      const sessionEvent = convertToSessionEvent(sessionId, event);
      stream.write(sessionEvent);
      delivered = true;
    } catch (error) {
      console.error(`[AgentServer] Error pushing event to agent for session ${key}:`, error);
    }
  }

  return delivered;
}

/**
 * 转换内部事件格式为 SessionEvent Proto 格式
 */
function convertToSessionEvent(sessionId, event) {
  const sessionEvent = {
    session_id: sessionId,
    timestamp_ms: event.timestamp || Date.now(),
    event_type: event.type || event.event_type || "unknown",
  };

  const eventType = sessionEvent.event_type;
  const payload = event.payload || event;

  // 根据事件类型填充相应字段
  if (eventType.startsWith("vad.")) {
    sessionEvent.vad = {
      action: payload.action || payload.event || "",
      prob: payload.prob || 0,
      track: payload.track || "",
      music_prob: payload.music_prob || payload.musicProb || 0,
    };
  } else if (eventType.startsWith("asr.")) {
    sessionEvent.asr = {
      text: payload.text || "",
      confidence: payload.confidence || 0,
      is_final: payload.isFinal || payload.is_final || false,
    };
  } else if (eventType.startsWith("call.")) {
    sessionEvent.call = {
      status: payload.status || "",
      call_sid: payload.callSid || payload.call_sid || sessionId,
    };
  }

  return sessionEvent;
}

/**
 * 启动 Agent gRPC 服务器
 * @param {number} port - 监听端口
 * @param {string} protoPath - agent.proto 文件路径
 * @param {function} onSuggestion - 接收到 Agent 建议的回调
 */
function startAgentServer(port, protoPath, onSuggestion) {
  if (server) {
    console.log("[AgentServer] Server already running");
    return server;
  }

  try {
    // 加载 proto 文件
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    agentProto = grpc.loadPackageDefinition(packageDefinition).agent;

    // 创建服务器
    server = new grpc.Server();
    
    // 保存建议回调
    server._suggestionCallback = onSuggestion;

    // 注册服务
    server.addService(agentProto.AgentBridge.service, {
      Subscribe: subscribeHandler,
    });

    // 绑定端口
    const address = `0.0.0.0:${port}`;
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          console.error("[AgentServer] Failed to bind server:", error);
          throw error;
        }
        console.log(`[AgentServer] gRPC server started on ${address}`);
      }
    );

    return server;
  } catch (error) {
    console.error("[AgentServer] Failed to start server:", error);
    throw error;
  }
}

/**
 * 停止 Agent gRPC 服务器
 */
function stopAgentServer() {
  if (!server) {
    return;
  }

  return new Promise((resolve) => {
    console.log("[AgentServer] Stopping gRPC server");
    
    // 关闭所有活动流
    for (const [sessionId, stream] of sessionStreams) {
      console.log(`[AgentServer] Closing stream for session ${sessionId}`);
      try {
        stream.end();
      } catch (error) {
        console.error(`[AgentServer] Error closing stream for session ${sessionId}:`, error);
      }
    }
    
    sessionStreams.clear();
    sessionFilters.clear();
    
    server.tryShutdown(() => {
      console.log("[AgentServer] gRPC server stopped");
      server = null;
      resolve();
    });
  });
}

/**
 * 获取活动订阅数
 */
function getActiveSubscriptionCount() {
  return sessionStreams.size;
}

/**
 * 检查会话是否有 Agent 订阅
 */
function hasSubscription(sessionId) {
  return sessionStreams.has(sessionId);
}

module.exports = {
  startAgentServer,
  stopAgentServer,
  pushEvent,
  getActiveSubscriptionCount,
  hasSubscription,
};
