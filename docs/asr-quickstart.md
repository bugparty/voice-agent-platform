# ASR + Agent Integration - Quick Start Guide

## What's New

✅ **Real-time Speech Recognition** - Deepgram ASR integration for live transcription  
✅ **Agent gRPC Server** - Subscribe to events (VAD, ASR, call) from agent services  
✅ **Agent Service Framework** - Python service template for event processing  
✅ **Web UI Transcripts** - Live transcript display with partial/final results  

## Quick Setup (5 minutes)

### 1. Get Deepgram API Key

```bash
# Sign up at https://deepgram.com
# Create an API key
# Copy it for next step
```

### 2. Configure media-service

```bash
cd apps/media-service

# Add to .env file
echo "DEEPGRAM_API_KEY=your_key_here" >> .env
echo "ASR_ENABLED=true" >> .env
echo "ASR_LANGUAGE=en-US" >> .env
echo "AGENT_GRPC_PORT=50052" >> .env
```

### 3. Start Services

```bash
# Terminal 1: VAD service
cd apps/ai-audio-service
./start.sh

# Terminal 2: Media service
cd apps/media-service
pnpm dev

# Terminal 3: Web UI
cd apps/web
pnpm dev
```

### 4. Make a Test Call

1. Open http://localhost:3000
2. Click "Call" button
3. Speak into the phone
4. Watch live transcripts appear! 🎉

## Architecture Summary

```
┌──────────┐     audio      ┌──────────────┐
│  Twilio  │───────────────►│ media-service│
└──────────┘                │              │
                            │  ┌─────────┐ │
                            │  │Deepgram │ │  ASR events
                            │  └────┬────┘ │─────────────┐
                            │       │      │             │
                            │  ┌────▼────┐ │             │
                            │  │VAD/gRPC │ │  VAD events │
                            │  └─────────┘ │─────────────┤
                            └──────┬───────┘             │
                                   │ SSE                 │
                            ┌──────▼───────┐   gRPC     │
                            │   Web UI     │   ┌────────▼────────┐
                            │ (Transcripts)│   │  agent-service  │
                            └──────────────┘   │ (Event Handler) │
                                               └─────────────────┘
```

## Files Created

### Core Integration

- ✅ `packages/proto/agent.proto` - Agent gRPC protocol definition
- ✅ `apps/media-service/src/asr/deepgram.js` - Deepgram client
- ✅ `apps/media-service/src/grpc/agentServer.js` - Agent gRPC server
- ✅ `apps/media-service/src/config/env.js` - Updated with ASR config
- ✅ `apps/media-service/src/events/normalize.js` - Added ASR events
- ✅ `apps/media-service/src/index.js` - Integrated ASR + Agent server

### Agent Service (Python)

- ✅ `apps/agent-service/agent_service/main.py` - Main entry point
- ✅ `apps/agent-service/agent_service/grpc_client.py` - gRPC client
- ✅ `apps/agent-service/agent_service/event_handler.py` - Event processor
- ✅ `apps/agent-service/requirements.txt` - Dependencies
- ✅ `apps/agent-service/start.sh` - Startup script
- ✅ `apps/agent-service/README.md` - Documentation

### Web UI

- ✅ `apps/web/src/app/page.tsx` - Added transcript display

### Documentation

- ✅ `docs/asr-agent-integration.md` - Full integration guide
- ✅ `docs/asr-quickstart.md` - This file!

## Event Flow

1. **Audio arrives** → Twilio sends μ-law audio to media-service
2. **Parallel processing**:
   - → Sent to ai-audio-service (VAD)
   - → Sent to Deepgram (ASR)
3. **Events generated**:
   - VAD: `vad.remote.start/update/end`
   - ASR: `asr.remote.partial/final`
4. **Events distributed**:
   - → Web UI (via SSE)
   - → Agent service (via gRPC)

## Configuration Options

### ASR Settings

```bash
ASR_ENABLED=true              # Enable/disable ASR
ASR_LANGUAGE=en-US            # Language code
ASR_MODEL=nova-2              # Deepgram model (nova-2, whisper, etc.)
DEEPGRAM_API_KEY=xxx          # Your API key
```

### Agent Settings

```bash
AGENT_GRPC_PORT=50052         # Agent gRPC server port
```

## Testing the Agent Service (Optional)

```bash
# Terminal 4: Start agent service
cd apps/agent-service

# Create venv and install deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Generate proto files
python -m grpc_tools.protoc \
  -I../../packages/proto \
  --python_out=agent_service/proto \
  --grpc_python_out=agent_service/proto \
  ../../packages/proto/agent.proto

# Configure
cp .env.example .env
# Edit SESSION_ID to match your call session

# Run
python -m agent_service.main
```

The agent will log all received events (VAD, ASR, call events).

## Verification Checklist

- [ ] Deepgram API key configured
- [ ] media-service starts without errors
- [ ] Agent gRPC server starts on port 50052
- [ ] Web UI shows "Transcripts" panel
- [ ] Making a call shows "Listening for speech..."
- [ ] Speaking shows partial transcripts (italic)
- [ ] Final transcripts appear in history
- [ ] Timeline shows ASR events

## Common Issues

### "DEEPGRAM_API_KEY not set"
→ Add key to `apps/media-service/.env`

### "Failed to create Deepgram connection"
→ Check API key validity and network

### "Agent gRPC server failed to start"
→ Check if port 50052 is available

### No transcripts appearing
→ Verify ASR_ENABLED=true and key is valid

## Next Steps

1. **Test with different languages**: Change `ASR_LANGUAGE`
2. **Integrate LLM**: Add OpenAI/Anthropic to agent-service
3. **Multi-session support**: Handle multiple concurrent calls
4. **Agent suggestions**: Implement action execution in media-service

## Support

- Full docs: `docs/asr-agent-integration.md`
- Deepgram docs: https://developers.deepgram.com
- Issues: Check logs in each service terminal

---

🎉 **You're all set!** Make a call and watch the magic happen!
