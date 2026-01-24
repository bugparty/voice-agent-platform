# media-service

Node.js 媒体服务，负责 Twilio 通话控制、Media Streams 和事件分发。

## 配置

在 `apps/media-service` 目录下创建 `.env` 文件：

```bash
# Twilio 基础配置
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# Phase 2: Conference & Web Join (可选)
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 拨叫目标号码（固定）
FIXED_TO_NUMBER=+16198597172

# 公网 URL（用于 Twilio webhook）
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io

# 可选配置
MEDIA_SERVICE_PORT=4001
MEDIA_WS_PATH=/media
EVENTS_PATH=/events
USE_PYTHON_VAD=true
AI_AUDIO_GRPC_URL=localhost:50051
```

## 快速配置拨叫号码

目前拨叫号码设置为：**+1 (619) 859-7172**

如需修改，编辑 `.env` 文件中的 `FIXED_TO_NUMBER`。

## 启动

```bash
# 安装依赖
pnpm install

# 启动服务
pnpm start

# 或使用 workspace 命令
pnpm --filter media-service start
```

## API 端点

### Call Control
- `POST /call/start` - 发起外呼
- `POST /call/hangup` - 挂断通话
- `POST /call/dtmf` - 发送 DTMF（digits）

### TwiML
- `POST /twiml` - Legacy TwiML (向后兼容)
- `POST /twiml/outbound` - PSTN leg Conference TwiML
- `POST /twiml/webJoin` - Web leg Conference TwiML

### Token
- `POST /token` - 生成 Twilio Access Token (用于 Web 端加入 Conference)

### Events
- `GET /events` - SSE 事件流（推送给 Web UI）

### IVR
- `POST /ivr/next-digits` - 设定下一次提示音结束后发送的 digits

### WebSocket
- `WS /media` - Twilio Media Streams 连接入口

## 目录结构

```
src/
├── config/
│   └── env.js          # 环境变量配置
├── events/
│   ├── bus.js          # 事件总线
│   └── normalize.js    # 事件标准化
├── grpc/
│   └── client.js       # gRPC 客户端（连接 ai-audio-service）
├── mock/
│   └── vadMock.js      # VAD 模拟器
├── sessions/
│   └── sessionStore.js # Session 管理
├── twilio/
│   ├── callControl.js  # Twilio 通话控制
│   └── twiml.js        # TwiML 生成器
└── index.js            # 主服务
```

## 依赖服务

- **ai-audio-service** (可选) - Python 音频 AI 服务，提供 VAD/ASR
- **Twilio** - 电话服务提供商

## 开发

### 查看日志

所有关键操作都有日志输出，使用 `[media-service]` 前缀。

### 测试 Conference 流程

1. 配置好所有环境变量
2. 启动 media-service
3. 启动 web UI
4. 点击 "Call" 按钮
5. 观察日志中的 session 创建和更新
6. 点击 "Join Conference" 测试 Web 加入

### DTMF/IVR 快速测试清单

1. 启动 media-service 与 web UI
2. 点击 "Call" 开始外呼
3. 在 DTMF Keypad 输入 digits
4. 点击 "Send Now"（立即发送）或 "Queue For Prompt"（等待提示音结束后发送）
5. 在 Timeline 中检查 `DTMF` 与 `IVR` 事件状态
6. 验证在超时或无响应时触发重试/升级

## 故障排查

参考：[`docs/phase2-setup.md`](../../docs/phase2-setup.md)
