# 🤖 Real Agent Implementation - Ready to Run!

## ✅ What's Been Implemented

The **real IVR agent** is now fully integrated! It works just like the mock-agent but with live transcripts:

### How It Works:
```
1. Call starts → Deepgram transcribes IVR speech
2. Transcript sent to Agent Service
3. Agent uses LLM (DeepSeek) to decide which digit to press
4. Agent sends DTMF automatically
5. UI shows: Blue transcripts + Green agent decisions
```

### Key Components:

1. **Agent Service** (`apps/agent-service/`)
   - `llm_client.py` - DeepSeek LLM integration
   - `ivr_agent.py` - IVR navigation logic
   - `event_handler.py` - Processes ASR events
   - `grpc_client.py` - Communicates with media-service
   - `main.py` - Main entry point

2. **Media Service** (`apps/media-service/`)
   - Deepgram ASR integration
   - Agent gRPC server
   - Executes agent suggestions (sends DTMF)

3. **Web UI** (`apps/web/`)
   - Displays transcripts (blue)
   - Displays agent decisions (green)

## 🚀 How to Run

### Prerequisites:
- ✅ Deepgram API key configured
- ✅ DeepSeek API key configured
- ✅ Twilio credentials configured
- ✅ All dependencies installed

### Start Services (4 terminals):

**Terminal 1 - AI Audio Service:**
```bash
cd /root/rose3/apps/ai-audio-service
python3 -m ai_audio_service.server
```
*Expected: `[ai-audio-service] gRPC server started on port 50051`*

**Terminal 2 - Agent Service (NEW!):**
```bash
cd /root/rose3/apps/agent-service
python3 -m agent_service.main
```
*Expected:*
```
[INFO] Starting Agent Service
[INFO] LLM Model: deepseek-chat
[INFO] Initialized LLM client
[INFO] Initialized IVR Agent with goal: Connect to a human representative
[INFO] Subscribing to session events...
```

**Terminal 3 - Media Service:**
```bash
cd /root/rose3/apps/media-service
npm start
```
*Expected:*
```
[media-service] Deepgram ASR enabled, language: en-US, model: nova-2
[AgentServer] gRPC server started on 0.0.0.0:50052
```

**Terminal 4 - Web UI:**
```bash
cd /root/rose3/apps/web
npm run dev
```
*Expected: `ready - started server on 0.0.0.0:3001`*

### Make a Test Call:

1. Open http://localhost:3001
2. Click **"Call"** button
3. Wait for IVR to speak

## 📊 What You Should See

### Terminal 2 (Agent Service):
```
[INFO] ASR [sess_xxx] FINAL: "Press 1 for billing, press 2 for..." (confidence: 0.92)
[INFO] LLM Decision: Press '1' - This option leads to billing department (confidence: high)
[INFO] Agent decision for [sess_xxx]: Press '1' - This option leads to billing department
[INFO] Queued suggestion abc123: Press 1
```

### Terminal 3 (Media Service):
```
[Deepgram] Final transcript for sess_xxx: "Press 1 for billing..." (confidence: 0.92)
[media-service] Received agent suggestion for session sess_xxx:
  suggestionId: abc123
  plan: Press 1: This option leads to billing department
  actions: 1
[Agent] Executing action: Send DTMF "1" for session sess_xxx
[media-service] sendDtmfWithPolicy: digits=1, source=agent:abc123
[Agent] Successfully sent DTMF "1" for session sess_xxx
```

### Web UI (http://localhost:3001):
```
Transcripts Panel:
┌────────────────────────────────────────────────────┐
│ 🔵 Press 1 for billing, press 2 for technical...  │ ← Deepgram ASR
│    (0.92 confidence) 10:23:45                      │
│                                                    │
│ 🟢 Agent selected: 1                               │ ← Agent Decision
│    Reason: This option leads to billing dept      │
│    (0.9 confidence) 10:23:46                       │
└────────────────────────────────────────────────────┘
```

## 🔧 Configuration Files

### Agent Service (`.env`):
```bash
MEDIA_SERVICE_GRPC_URL=localhost:50052
EVENT_FILTERS=asr.*,call.*
LOG_LEVEL=INFO
DEEPSEEK_API_KEY=sk-94b13516c1b54192b29de46137143864
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### Media Service (`.env`):
```bash
# ASR Configuration
ASR_ENABLED=true
DEEPGRAM_API_KEY=b1218ca117cc3f62d5d57f2b6f1bd694152b8a4c
ASR_LANGUAGE=en-US
ASR_MODEL=nova-2

# Agent Configuration
AGENT_GRPC_PORT=50052

# ... (Twilio credentials)
```

## 🎯 Agent Logic (Same as Mock-Agent)

The agent uses the same LLM decision-making logic as the mock-agent:

### System Prompt:
```
You are an intelligent IVR navigation agent.
Your goal: Connect to a human representative.

Guidelines:
- Look for keywords: "representative", "agent", "human", "operator"
- Prefer customer service/support options
- Learn from navigation history
- Avoid loops

Response format:
{
  "digit": "1",
  "reasoning": "This option leads to customer service",
  "confidence": "high"
}
```

### Decision Process:
1. Receive IVR transcript from Deepgram
2. Analyze available options
3. Consider navigation history
4. Ask LLM to decide which digit to press
5. Send DTMF via Twilio
6. Update UI with decision

## 🐛 Troubleshooting

### Agent Service Not Starting?
```bash
# Check if proto files exist
ls apps/agent-service/agent_service/proto/

# Should see: agent_pb2.py, agent_pb2_grpc.py
# If not, regenerate:
cd apps/agent-service
python3 -m grpc_tools.protoc -I../../packages/proto \
  --python_out=agent_service/proto \
  --grpc_python_out=agent_service/proto \
  ../../packages/proto/agent.proto
```

### No Agent Decisions?
Check:
1. **ASR working?** Look for blue transcripts in UI
2. **Agent connected?** Check Terminal 2 for "Subscribing to session events"
3. **LLM API key valid?** Check Terminal 2 for LLM errors

### DTMF Not Sending?
Check Terminal 3 for:
```
[Agent] Executing action: Send DTMF "X"
[media-service] sendDtmfWithPolicy: digits=X
```

If blocked, check:
- Call phase (must be "IVR")
- DTMF cooldown (700ms between presses)

## 📁 Files Changed/Added

### New Files:
```
apps/agent-service/agent_service/llm_client.py
apps/agent-service/agent_service/ivr_agent.py
apps/agent-service/agent_service/proto/agent_pb2.py
apps/agent-service/agent_service/proto/agent_pb2_grpc.py
apps/agent-service/.env
```

### Modified Files:
```
apps/agent-service/agent_service/event_handler.py
apps/agent-service/agent_service/main.py
apps/agent-service/agent_service/grpc_client.py
apps/agent-service/requirements.txt
apps/media-service/src/index.js
apps/media-service/package.json
apps/web/package.json
```

## 🎉 Success Criteria

You know it's working when you see:

1. ✅ **Terminal 2**: "LLM Decision: Press 'X'"
2. ✅ **Terminal 3**: "Agent successfully sent DTMF"
3. ✅ **UI**: Blue transcripts + Green agent decisions
4. ✅ **IVR**: Responds to the digit pressed

## 🔄 Comparison: Mock vs Real

| Feature | Mock Agent | Real Agent |
|---------|-----------|------------|
| IVR Tree | Hardcoded JSON | Live phone system |
| Transcripts | Simulated | Real (Deepgram) |
| Decisions | Based on JSON | Based on live ASR |
| DTMF | Simulated | Real (Twilio) |
| LLM | Same prompts | Same prompts |
| API Key | Same DeepSeek | Same DeepSeek |

## 💡 Next Steps

1. **Test with different IVR systems** - Try various phone numbers
2. **Monitor agent decisions** - Check if it navigates correctly
3. **Adjust prompts** - Modify `llm_client.py` if needed
4. **Add more actions** - Implement TTS, wait, etc.

## 🚨 Important Notes

- **Session ID**: Agent service subscribes to ALL sessions (SESSION_ID is empty)
- **Event Filters**: Only subscribes to ASR and call events (not VAD)
- **Cooldown**: 700ms between DTMF presses to avoid overwhelming IVR
- **Confidence**: Agent reports high/medium/low confidence for each decision

---

**The agent is ready! Just start all 4 services and make a call.** 🚀

