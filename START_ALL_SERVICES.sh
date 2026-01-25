#!/bin/bash
# Complete startup script - run this to verify setup

echo "========================================"
echo "🚀 Starting All Services"
echo "========================================"
echo ""

# Check current directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this from /root/rose3"
    exit 1
fi

echo "✓ In correct directory: $(pwd)"
echo ""

# Check if services exist
echo "Checking services..."
if [ ! -d "apps/agent-service" ]; then
    echo "❌ apps/agent-service not found"
    exit 1
fi
echo "✓ Agent service found"

if [ ! -d "apps/media-service" ]; then
    echo "❌ apps/media-service not found"
    exit 1
fi
echo "✓ Media service found"

if [ ! -d "apps/ai-audio-service" ]; then
    echo "❌ apps/ai-audio-service not found"
    exit 1
fi
echo "✓ AI Audio service found"

if [ ! -d "apps/web" ]; then
    echo "❌ apps/web not found"
    exit 1
fi
echo "✓ Web UI found"
echo ""

# Check Python dependencies
echo "Checking Python dependencies..."
if ! python3 -c "import openai" 2>/dev/null; then
    echo "⚠️  openai not installed - installing..."
    cd apps/agent-service
    pip3 install --break-system-packages -r requirements.txt
    cd ../..
fi
echo "✓ Python dependencies OK"
echo ""

# Check proto files
echo "Checking proto files..."
if [ ! -f "apps/agent-service/agent_service/proto/agent_pb2.py" ]; then
    echo "⚠️  Proto files missing - generating..."
    cd apps/agent-service
    python3 -m grpc_tools.protoc -I../../packages/proto \
        --python_out=agent_service/proto \
        --grpc_python_out=agent_service/proto \
        ../../packages/proto/agent.proto
    cd ../..
fi
echo "✓ Proto files OK"
echo ""

# Check .env files
echo "Checking configuration..."
if [ ! -f "apps/agent-service/.env" ]; then
    echo "⚠️  Agent service .env missing - creating..."
    cat > apps/agent-service/.env << 'EOF'
MEDIA_SERVICE_GRPC_URL=localhost:50052
SESSION_ID=
EVENT_FILTERS=asr.*,call.*
LOG_LEVEL=INFO
DEEPSEEK_API_KEY=sk-94b13516c1b54192b29de46137143864
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
EOF
fi
echo "✓ Agent service configured"

if [ ! -f "apps/media-service/.env" ]; then
    echo "❌ Media service .env missing - please configure Twilio credentials"
    exit 1
fi
echo "✓ Media service configured"
echo ""

echo "========================================"
echo "📋 Start Services in 4 Terminals:"
echo "========================================"
echo ""
echo "Terminal 1:"
echo "  cd /root/rose3/apps/ai-audio-service"
echo "  python3 -m ai_audio_service.server"
echo ""
echo "Terminal 2:"
echo "  cd /root/rose3/apps/agent-service"
echo "  python3 -m agent_service.main"
echo ""
echo "Terminal 3:"
echo "  cd /root/rose3/apps/media-service"
echo "  npm start"
echo ""
echo "Terminal 4:"
echo "  cd /root/rose3/apps/web"
echo "  pnpm run dev"
echo ""
echo "Then open: http://localhost:3001"
echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"

