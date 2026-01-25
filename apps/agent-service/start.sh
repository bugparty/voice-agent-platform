#!/bin/bash

# Agent Service startup script

set -e

echo "=== Agent Service Startup ==="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Generate proto files
echo "Generating proto files..."
python -m grpc_tools.protoc \
    -I../../packages/proto \
    --python_out=agent_service/proto \
    --grpc_python_out=agent_service/proto \
    --pyi_out=agent_service/proto \
    ../../packages/proto/agent.proto

echo "Proto files generated successfully"

# Start the service
echo "Starting Agent Service..."
python -m agent_service.main
