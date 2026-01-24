# AI Audio Service

Python gRPC service for audio processing with Silero VAD (Voice Activity Detection).

## 功能

- 接收来自 Node.js media-service 的音频流（μ-law 格式）
- 解码和重采样音频（8kHz → 16kHz）
- 使用 Silero VAD 进行语音活动检测
- 通过 gRPC 双向流返回 VAD 事件

## 快速开始

### 1. 创建虚拟环境

**Windows (PowerShell):**
```powershell
cd apps/ai-audio-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
cd apps\ai-audio-service
python -m venv .venv
.venv\Scripts\activate.bat
```

**macOS/Linux:**
```bash
cd apps/ai-audio-service
python3 -m venv .venv
source .venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

**注意:** 首次安装可能需要几分钟，因为需要下载 PyTorch 和 Silero VAD 模型。

### 3. 启动服务

```bash
python -m ai_audio_service.main
```

或者：

```bash
python ai_audio_service/main.py
```

服务默认监听端口 `50051`，可以通过环境变量修改：

```bash
# Windows PowerShell
$env:AI_AUDIO_SERVICE_PORT="50051"
python -m ai_audio_service.main

# macOS/Linux
export AI_AUDIO_SERVICE_PORT=50051
python -m ai_audio_service.main
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_AUDIO_SERVICE_PORT` | `50051` | gRPC 服务端口 |
| `AUDIOAI_PROTO_PATH` | `../../packages/proto/audioai.proto` | Proto 文件路径 |

## 项目结构

```
ai-audio-service/
├── ai_audio_service/
│   ├── main.py              # gRPC 服务器入口
│   ├── audio/
│   │   └── decoder.py       # 音频解码和重采样
│   └── vad/
│       ├── silero.py        # Silero VAD 包装器
│       └── state_machine.py # VAD 状态机
├── requirements.txt
└── requirements.txt
└── README.md
```

## 故障排除

### 问题：模型加载失败

如果 Silero VAD 模型加载失败，服务会回退到简单的能量检测模式。检查：

1. 网络连接（首次运行需要从 torch.hub 下载模型）
2. PyTorch 是否正确安装：`python -c "import torch; print(torch.__version__)"`
3. 查看控制台输出是否有错误信息

### 问题：端口被占用

```bash
# Windows
netstat -ano | findstr :50051

# macOS/Linux
lsof -i :50051
```

修改端口：
```bash
$env:AI_AUDIO_SERVICE_PORT="50052"  # Windows
export AI_AUDIO_SERVICE_PORT=50052  # macOS/Linux
```

### 问题：Proto 文件未生成

如果遇到 proto 相关错误，确保：

1. `grpcio-tools` 已安装：`pip install grpcio-tools`
2. Proto 文件路径正确（默认在 `packages/proto/audioai.proto`）
3. 服务会自动生成 proto 文件，首次运行可能需要几秒钟

## 开发

### 运行测试

（待添加测试）

### 调试

启用详细日志：

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 与 Node.js 服务集成

确保 Node.js media-service 的配置中：

```env
USE_PYTHON_VAD=true
AI_AUDIO_GRPC_URL=localhost:50051
```

然后启动顺序：

1. 先启动 Python 服务（本服务）
2. 再启动 Node.js media-service
3. 最后启动 Web UI
