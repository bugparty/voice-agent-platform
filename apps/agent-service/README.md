# Agent Service

AI Agent service that subscribes to media-service events (VAD, ASR, call events) via gRPC and provides intelligent suggestions.

## Architecture

- **gRPC Client**: Connects to media-service's Agent gRPC server
- **Event Handler**: Processes incoming events from media-service
- **LLM Processor**: (Future) Analyzes events and generates suggestions

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Generate proto files:
```bash
python -m grpc_tools.protoc \
  -I../../packages/proto \
  --python_out=agent_service/proto \
  --grpc_python_out=agent_service/proto \
  ../../packages/proto/agent.proto
```

3. Set environment variables:
```bash
export MEDIA_SERVICE_GRPC_URL=localhost:50052
```

4. Run the service:
```bash
python -m agent_service.main
```

## Configuration

Environment variables:

- `MEDIA_SERVICE_GRPC_URL`: Address of media-service gRPC server (default: localhost:50052)
- `SESSION_ID`: Session to subscribe to (use `*` for all sessions)
- `LOG_LEVEL`: Logging level (default: INFO)

## Development

The service is designed to:
1. Subscribe to session events via gRPC
2. Receive real-time VAD and ASR events
3. Process events through LLM (future implementation)
4. Send back suggestions to media-service

Current implementation focuses on the gRPC client and event handling infrastructure.
