const DEFAULT_STATE = {
  state: "idle",
  pendingDigits: null,
  lastDigits: null,
  attempts: 0,
  lastPromptAt: null,
  lastVadEndAt: null
};

const timersBySession = new Map();

function getTimers(sessionId) {
  if (!timersBySession.has(sessionId)) {
    timersBySession.set(sessionId, {
      promptTimeout: null,
      responseTimeout: null,
      retryDelay: null
    });
  }
  return timersBySession.get(sessionId);
}

function clearTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }
}

function clearAllTimers(sessionId) {
  const timers = timersBySession.get(sessionId);
  if (!timers) return;
  clearTimer(timers.promptTimeout);
  clearTimer(timers.responseTimeout);
  clearTimer(timers.retryDelay);
  timers.promptTimeout = null;
  timers.responseTimeout = null;
  timers.retryDelay = null;
}

function createIvrController({ emitIvrEvent, emitDtmfEvent, sendDtmf, canSendDtmf }) {
  function clearPromptTimeout(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.promptTimeout);
    timers.promptTimeout = null;
  }

  function clearResponseTimeout(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.responseTimeout);
    timers.responseTimeout = null;
  }

  function clearRetryDelay(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.retryDelay);
    timers.retryDelay = null;
  }

  function initSession(session) {
    if (!session.ivr) {
      session.ivr = { ...DEFAULT_STATE };
    }
    if (!session.ivrConfig) {
      session.ivrConfig = {
        promptTimeoutMs: 4000,
        responseTimeoutMs: 6000,
        retryDelayMs: 1500,
        maxRetries: 2
      };
    }
  }

  function transition(session, nextState, detail) {
    session.ivr.state = nextState;
    emitIvrEvent(session, nextState, detail);
  }

  async function attemptSendDigits(session, reason) {
    if (!session.ivr?.pendingDigits) {
      return;
    }

    clearPromptTimeout(session);
    clearRetryDelay(session);

    if (!canSendDtmf(session)) {
      emitDtmfEvent(session, {
        digits: session.ivr.pendingDigits,
        status: "blocked",
        reason: "policy"
      });
      transition(session, "blocked", { reason: "policy" });
      session.ivr.pendingDigits = null;
      return;
    }

    transition(session, "sending_digits", { reason });
    try {
      await sendDtmf(session, session.ivr.pendingDigits);
      session.ivr.lastDigits = session.ivr.pendingDigits;
      session.ivr.pendingDigits = null;
      transition(session, "waiting_for_response", { reason });
      scheduleResponseTimeout(session);
    } catch (error) {
      emitDtmfEvent(session, {
        digits: session.ivr.pendingDigits,
        status: "failed",
        reason: error?.message || "send_failed"
      });
      transition(session, "retrying", { reason: "send_failed" });
      scheduleRetry(session);
    }
  }

  function schedulePromptTimeout(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.promptTimeout);
    timers.promptTimeout = setTimeout(() => {
      attemptSendDigits(session, "prompt_timeout");
    }, session.ivrConfig.promptTimeoutMs);
  }

  function scheduleResponseTimeout(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.responseTimeout);
    timers.responseTimeout = setTimeout(() => {
      const attempts = session.ivr.attempts || 0;
      if (attempts >= session.ivrConfig.maxRetries) {
        transition(session, "escalated", { reason: "max_retries" });
        session.phase = "HUMAN";
        return;
      }
      session.ivr.attempts = attempts + 1;
      transition(session, "retrying", { reason: "response_timeout", attempt: session.ivr.attempts });
      scheduleRetry(session);
    }, session.ivrConfig.responseTimeoutMs);
  }

  function scheduleRetry(session) {
    const timers = getTimers(session.sessionId);
    clearTimer(timers.retryDelay);
    timers.retryDelay = setTimeout(() => {
      if (session.ivr.lastDigits) {
        session.ivr.pendingDigits = session.ivr.lastDigits;
      }
      attemptSendDigits(session, "retry");
    }, session.ivrConfig.retryDelayMs);
  }

  function setNextDigits(session, digits) {
    initSession(session);
    clearResponseTimeout(session);
    clearRetryDelay(session);
    session.ivr.pendingDigits = digits;
    session.ivr.attempts = 0;
    transition(session, "waiting_for_prompt", { digits });
    schedulePromptTimeout(session);
  }

  function handleVadEvent(session, action, source) {
    initSession(session);
    if (source !== "remote") return;

    if (action === "start") {
      if (session.ivr.state === "waiting_for_prompt") {
        session.ivr.lastPromptAt = Date.now();
        clearPromptTimeout(session);
        transition(session, "prompt_playing");
      }
      return;
    }

    if (action === "end") {
      session.ivr.lastVadEndAt = Date.now();
      if (session.ivr.state === "prompt_playing" || session.ivr.state === "waiting_for_prompt") {
        attemptSendDigits(session, "prompt_end");
      } else if (session.ivr.state === "waiting_for_response" && session.ivr.pendingDigits) {
        transition(session, "waiting_for_prompt");
        schedulePromptTimeout(session);
      } else if (session.ivr.state === "waiting_for_response") {
        transition(session, "idle");
      }
    }
  }

  function cleanupSession(sessionId) {
    clearAllTimers(sessionId);
    timersBySession.delete(sessionId);
  }

  return {
    initSession,
    handleVadEvent,
    setNextDigits,
    cleanupSession
  };
}

module.exports = {
  createIvrController
};
