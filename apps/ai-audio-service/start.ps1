# PowerShell startup script for Windows

Write-Host "Starting AI Audio Service..." -ForegroundColor Green

# Ensure virtual environment exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# Start gRPC service
Write-Host "Starting gRPC server on port 50051..." -ForegroundColor Green
python -m ai_audio_service.main
