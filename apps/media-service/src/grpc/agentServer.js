const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

// Internal bookkeeping for active streams and subscriptions
const sessionStreams = new Map();

// Internal bookkeeping for active streams and subscriptions
const sessionFilters = new Map();

// Special key for "all sessions" subscriptions
const ALL_SESSIONS_KEY = "__all__";

let agentProto = null;
let server = null;

/**
 * 
 * @param {string} eventType -  "vad.remote.start"
 * @param {string[]} filters -  ["vad.*", "asr.*"]
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
 *  Subscribe RPC
 * Agent 
 */
function subscribeHandler(call) {
  let sessionId = null;
  let eventTypes = [];

  console.log("[AgentServer] New agent connection");

  // Internal bookkeeping for active streams and subscriptions
  call.on("data", (agentMessage) => {
    try {
      if (agentMessage.subscribe) {
        // Internal bookkeeping for active streams and subscriptions
        const requestedSessionId = agentMessage.subscribe.session_id || agentMessage.session_id;
        eventTypes = agentMessage.subscribe.event_types || [];
        const wantsAllSessions =
          !requestedSessionId ||
          requestedSessionId === "*" ||
          requestedSessionId === "all";

        sessionId = wantsAllSessions ? ALL_SESSIONS_KEY : requestedSessionId;

        const sessionLabel = wantsAllSessions ? "ALL_SESSIONS" : sessionId;
        console.log(`[AgentServer] Agent subscribed to session ${sessionLabel}, filters: ${eventTypes.join(", ")}`);
        
        // Internal bookkeeping for active streams and subscriptions
        sessionStreams.set(sessionId, call);
        sessionFilters.set(sessionId, eventTypes);
        
        // Internal bookkeeping for active streams and subscriptions
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
        // Internal bookkeeping for active streams and subscriptions
        const suggestion = agentMessage.suggestion;
        sessionId = agentMessage.session_id;
        
        console.log(`[AgentServer] Received suggestion from agent for session ${sessionId}:`, {
          suggestionId: suggestion.suggestion_id,
          plan: suggestion.plan,
          actionCount: suggestion.actions?.length || 0,
          confidence: suggestion.confidence,
        });
        
        // Internal bookkeeping for active streams and subscriptions
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
 *  Agent
 * @param {string} sessionId - ID
 * @param {object} event - 
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
    // Internal bookkeeping for active streams and subscriptions
    if (!matchesFilter(eventType, filters)) {
      continue;
    }

    try {
      // Internal bookkeeping for active streams and subscriptions
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
 *  SessionEvent Proto 
 */
function convertToSessionEvent(sessionId, event) {
  const sessionEvent = {
    session_id: sessionId,
    timestamp_ms: event.timestamp || Date.now(),
    event_type: event.type || event.event_type || "unknown",
  };

  const eventType = sessionEvent.event_type;
  const payload = event.payload || event;

  // Internal bookkeeping for active streams and subscriptions
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
 *  Agent gRPC 
 * @param {number} port - 
 * @param {string} protoPath - agent.proto 
 * @param {function} onSuggestion -  Agent 
 */
function startAgentServer(port, protoPath, onSuggestion) {
  if (server) {
    console.log("[AgentServer] Server already running");
    return server;
  }

  try {
    // Internal bookkeeping for active streams and subscriptions
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    agentProto = grpc.loadPackageDefinition(packageDefinition).agent;

    // Internal bookkeeping for active streams and subscriptions
    server = new grpc.Server();
    
    // Internal bookkeeping for active streams and subscriptions
    server._suggestionCallback = onSuggestion;

    // Internal bookkeeping for active streams and subscriptions
    server.addService(agentProto.AgentBridge.service, {
      Subscribe: subscribeHandler,
    });

    // Internal bookkeeping for active streams and subscriptions
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
 *  Agent gRPC 
 */
function stopAgentServer() {
  if (!server) {
    return;
  }

  return new Promise((resolve) => {
    console.log("[AgentServer] Stopping gRPC server");
    
    // Internal bookkeeping for active streams and subscriptions
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
 * 
 */
function getActiveSubscriptionCount() {
  return sessionStreams.size;
}

/**
 *  Agent 
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
