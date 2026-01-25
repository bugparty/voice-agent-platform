#!/bin/bash
# Quick start script for the real agent system

echo "==================================="
echo "🤖 Starting Real Agent System"
echo "==================================="
echo ""

# Check if required files exist
echo "Checking configuration..."

if [ ! -f "/root/rose3/apps/media-service/.env" ]; then
    echo "❌ Missing: apps/media-service/.env"
    echo "   Please configure Twilio and Deepgram credentials"
    exit 1
fi

if [ ! -f "/root/rose3/apps/agent-service/.env" ]; then
    echo "❌ Missing: apps/agent-service/.env"
    echo "   Creating default .env file..."
    cat > /root/rose3/apps/agent-service/.env << 'EOF'
MEDIA_SERVICE_GRPC_URL=localhost:50052
SESSION_ID=
EVENT_FILTERS=asr.*,call.*
LOG_LEVEL=INFO
DEEPSEEK_API_KEY=sk-94b13516c1b54192b29de46137143864
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
EOF
    echo "✓ Created apps/agent-service/.env"
fi

# Check proto files
if [ ! -f "/root/rose3/apps/agent-service/agent_service/proto/agent_pb2.py" ]; then
    echo "⚙️  Generating proto files..."
    cd /root/rose3/apps/agent-service
    python3 -m grpc_tools.protoc -I../../packages/proto \
        --python_out=agent_service/proto \
        --grpc_python_out=agent_service/proto \
        ../../packages/proto/agent.proto
    
    if [ $? -eq 0 ]; then
        echo "✓ Proto files generated"
    else
        echo "❌ Failed to generate proto files"
        exit 1
    fi
    cd /root/rose3
fi

echo ""
echo "✅ Configuration complete!"
echo ""
echo "==================================="
echo "📋 Start these services in order:"
echo "==================================="
echo ""
echo "Terminal 1 - AI Audio Service:"
echo "  cd /root/rose3/apps/ai-audio-service"
echo "  python3 -m ai_audio_service.server"
echo ""
echo "Terminal 2 - Agent Service:"
echo "  cd /root/rose3/apps/agent-service"
echo "  python3 -m agent_service.main"
echo ""
echo "Terminal 3 - Media Service:"
echo "  cd /root/rose3/apps/media-service"
echo "  npm start"
echo ""
echo "Terminal 4 - Web UI:"
echo "  cd /root/rose3/apps/web"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:3001"
echo ""
echo "==================================="
echo "📖 For detailed instructions, see:"
echo "   AGENT_READY_TO_RUN.md"
echo "==================================="

