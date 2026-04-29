# 基于 Dev Containers 的 Python 镜像，再安装 Node.js 及 AI 音频服务所需的系统依赖
FROM mcr.microsoft.com/devcontainers/python:3.11-bookworm

# 安装 OpenCV、MediaPipe、PortAudio (sounddevice) 等所需的系统库
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libportaudio2 \
    portaudio19-dev \
    build-essential \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 使用 devcontainer 的 Node feature 安装 Node.js 和 pnpm，此处仅作系统层准备
# Node 与 pnpm 由 devcontainer.json 的 "features" 注入
