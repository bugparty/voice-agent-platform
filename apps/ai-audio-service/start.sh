#!/bin/bash
# Shell 启动脚本 (macOS/Linux)

echo "Starting AI Audio Service..."

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# 激活虚拟环境
echo "Activating virtual environment..."
. .venv/bin/activate

# 检查依赖
echo "Checking dependencies..."
pip3 install -r requirements.txt --quiet

# 启动服务
echo "Starting gRPC server on port 50051..."
python3 -m ai_audio_service.main
