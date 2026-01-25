# 🔧 Wildcard Subscription Fix

## 🐛 Problem Found

The agent was subscribing with `sessionId="*"` (wildcard), but the `pushEvent` function was only looking for exact session ID matches. 

**Before:**
```javascript
function pushEvent(sessionId, event) {
  const stream = sessionStreams.get(sessionId);  // ❌ Only finds exact match
  if (!stream) {
    return false;  // Always returns false for wildcard subscriptions!
  }
  // ...
}
```

When agent subscribes with `"*"`, it's stored as:
```
sessionStreams.set("*", stream)
```

But when pushing events for session `"sess_abc123"`:
```
sessionStreams.get("sess_abc123")  // ❌ Returns undefined!
```

## ✅ Solution

Changed `pushEvent` to iterate through all subscriptions and match both exact session IDs and wildcards:

**After:**
```javascript
function pushEvent(sessionId, event) {
  // Check all subscribed streams
  for (const [subscribedSessionId, stream] of sessionStreams) {
    // Match exact session ID or wildcard "*"
    if (subscribedSessionId === sessionId || subscribedSessionId === "*") {
      // ✅ Now finds wildcard subscriptions!
      // Check filters and send event
    }
  }
}
```

## 📝 Changes Made

**File:** `apps/media-service/src/grpc/agentServer.js`

1. Changed from `sessionStreams.get(sessionId)` to iterating all streams
2. Added wildcard matching: `subscribedSessionId === "*"`
3. Added debug logging for ASR events

## 🚀 How to Apply

**Restart media-service (Terminal 3):**
```bash
cd /root/rose3/apps/media-service
npm start
```

**Then restart agent-service (Terminal 2):**
```bash
cd /root/rose3/apps/agent-service
python3 -m agent_service.main
```

## 📊 What You Should See

### Terminal 3 (Media Service):
```
[AgentServer] Agent subscribed to session *, filters: asr.*, call.*
[AgentServer] Pushed asr.remote.final to agent (session: *): "Press 1 for pharmacy services..."
```

### Terminal 2 (Agent Service):
```
[INFO] ASR [sess_xxx] FINAL: "Press 1 for pharmacy services..." (confidence: 1.00)
[INFO] LLM Decision: Press '1' - Pharmacy services option (confidence: high)
[INFO] Queued suggestion abc123: Press 1
```

### Web UI:
- 🔵 Blue boxes (ASR transcripts)
- 🟢 Green boxes (Agent decisions with 🤖)
- 🟢 Green glowing keypad digit

## ✅ Verification

After restart, check Terminal 3 for:
```
[AgentServer] New agent connection
[AgentServer] Agent subscribed to session *, filters: asr.*, call.*
```

Make a call and look for:
```
[AgentServer] Pushed asr.remote.final to agent (session: *): "Press..."
```

If you see these logs, the wildcard subscription is working! 🎉

## 🎯 Why This Fix Works

1. Agent subscribes with `sessionId="*"`
2. Media service stores: `sessionStreams.set("*", stream)`
3. When ASR event happens for `"sess_abc123"`:
   - Old code: `sessionStreams.get("sess_abc123")` → undefined ❌
   - New code: Iterates and finds `"*"` subscription → sends event ✅
4. Agent receives event and makes decision
5. DTMF sent automatically

Now the wildcard subscription actually works! 🚀

