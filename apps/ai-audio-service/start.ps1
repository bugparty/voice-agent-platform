# PowerShell 启动脚本 (Windows)

Write-Host "Starting AI Audio Service..." -ForegroundColor Green

# 检查虚拟环境
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# 激活虚拟环境
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# 检查依赖
Write-Host "Checking dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# 启动服务
Write-Host "Starting gRPC server on port 50051..." -ForegroundColor Green
python -m ai_audio_service.main
