# ASR + Agent Integration Guide

This guide explains the new ASR (Automatic Speech Recognition) and Agent integration features.

## Overview

The system now includes:
1. **Deepgram ASR Integration** - Real-time speech-to-text transcription
2. **Agent gRPC Server** - Media-service acts as gRPC server for Agent subscriptions
3. **Agent Service** - Python service that subscribes to events and can send suggestions
4. **Web UI Updates** - Real-time transcript display

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ ai-audio-service│◄────────│  media-service  │◄────────│  agent-service  │
│    (Python)     │  gRPC   │    (Node.js)    │  gRPC   │    (Python)     │
│                 │ client  │                 │ server  │                 │
│   VAD/Audio AI  │────────►│   Orchestrator  │────────►│   LLM/Planning  │
└─────────────────┘  events └─────────────────┘  events └─────────────────┘
                                    │
                                    ├──► Deepgram (ASR)
                                    │
                                    └──► Web UI (SSE)
```

## Setup Instructions

### 1. Install Dependencies

```bash
# media-service (already done)
cd apps/media-service
pnpm install

# agent-service
cd apps/agent-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Generate Proto Files

```bash
# For agent-service
cd apps/agent-service
python -m grpc_tools.protoc \
  -I../../packages/proto \
  --python_out=agent_service/proto \
  --grpc_python_out=agent_service/proto \
  ../../packages/proto/agent.proto
```

### 3. Configure Environment Variables

#### media-service `.env`

```bash
# Deepgram ASR
DEEPGRAM_API_KEY=your_deepgram_api_key
ASR_ENABLED=true
ASR_LANGUAGE=en-US
ASR_MODEL=nova-2

# Agent gRPC Server
AGENT_GRPC_PORT=50052
```

#### agent-service `.env`

```bash
MEDIA_SERVICE_GRPC_URL=localhost:50052
SESSION_ID=test-session
EVENT_FILTERS=vad.*,asr.*,call.*
LOG_LEVEL=INFO
```

### 4. Get Deepgram API Key

1. Sign up at https://deepgram.com
2. Create a new API key
3. Add it to `media-service/.env`

### 5. Start Services

```bash
# Terminal 1: ai-audio-service (VAD)
cd apps/ai-audio-service
./start.sh

# Terminal 2: media-service
cd apps/media-service
pnpm dev

# Terminal 3: agent-service (optional)
cd apps/agent-service
./start.sh

# Terminal 4: web UI
cd apps/web
pnpm dev
```

## Features

### Real-time Transcription

- **Partial Transcripts**: Displayed in real-time as italic text
- **Final Transcripts**: Added to transcript history with confidence score
- **Timeline Display**: All ASR events appear in the timeline

### Agent Subscription

The agent-service can:
- Subscribe to specific event types (VAD, ASR, call events)
- Receive real-time events via gRPC bidirectional stream
- Send suggestions back to media-service
- Process events for LLM integration (future)

### Event Types

#### ASR Events

- `asr.remote.partial` - Partial (interim) transcription
- `asr.remote.final` - Final transcription result

#### VAD Events

- `vad.remote.start` - Speech detected
- `vad.remote.update` - Ongoing speech
- `vad.remote.end` - Speech ended

#### Call Events

- `call.connecting` - Call initiated
- `call.in_call` - Call connected
- `call.ending` - Call ending

## API Reference

### Agent Proto (agent.proto)

```protobuf
service AgentBridge {
  rpc Subscribe(stream AgentMessage) returns (stream SessionEvent);
}
```

Key messages:
- `AgentMessage` - Agent → media-service (subscriptions & suggestions)
- `SessionEvent` - media-service → Agent (events)
- `AgentSuggestion` - Agent suggestions with actions
- `AgentAction` - Action types (TTS, DTMF, Wait, etc.)

### Deepgram Module

```javascript
// apps/media-service/src/asr/deepgram.js

createConnection(sessionId, apiKey, config, callbacks)
sendAudio(sessionId, audioBuffer)
closeConnection(sessionId)
```

### Agent gRPC Server

```javascript
// apps/media-service/src/grpc/agentServer.js

startAgentServer(port, protoPath, onSuggestion)
pushEvent(sessionId, event)
stopAgentServer()
```

## Testing

### 1. Test ASR Only

1. Set `ASR_ENABLED=true` in media-service
2. Start media-service and web UI
3. Make a call
4. Speak and watch transcripts appear in Web UI

### 2. Test Agent Subscription

1. Start all services (including agent-service)
2. Make a call
3. Watch agent-service logs for received events
4. Agent should log VAD and ASR events in real-time

## Troubleshooting

### Deepgram Connection Issues

- Check API key is valid
- Verify network connectivity
- Check Deepgram service status

### Proto Generation Errors

```bash
# Make sure grpcio-tools is installed
pip install grpcio-tools

# Regenerate proto files
cd apps/agent-service
python -m grpc_tools.protoc \
  -I../../packages/proto \
  --python_out=agent_service/proto \
  --grpc_python_out=agent_service/proto \
  ../../packages/proto/agent.proto
```

### Agent Connection Refused

- Ensure media-service is running
- Check AGENT_GRPC_PORT matches in both services
- Verify firewall/network settings

## Port Allocation

| Service | Port | Purpose |
|---------|------|---------|
| media-service HTTP | 4001 | REST API & WebSocket |
| ai-audio-service gRPC | 50051 | VAD processing |
| **media-service gRPC** | **50052** | **Agent subscriptions (NEW)** |
| web UI | 3000 | Web interface |

## Future Enhancements

- [ ] LLM integration in agent-service
- [ ] Multi-session support
- [ ] Agent suggestion execution
- [ ] Conversation history persistence
- [ ] Custom ASR models
- [ ] Multi-language support

## Resources

- [Deepgram API Documentation](https://developers.deepgram.com/)
- [gRPC Python Tutorial](https://grpc.io/docs/languages/python/)
- [Proto3 Language Guide](https://protobuf.dev/programming-guides/proto3/)
