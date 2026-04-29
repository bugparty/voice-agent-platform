#!/bin/bash
# Shell startup script for macOS/Linux

echo "Starting AI Audio Service..."

# Ensure virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
. .venv/bin/activate

# Install dependencies
echo "Checking dependencies..."
pip3 install -r requirements.txt --quiet

# Start gRPC service
echo "Starting gRPC server on port 50051..."
python3 -m ai_audio_service.main
