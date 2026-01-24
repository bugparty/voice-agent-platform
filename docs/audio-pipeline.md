# 音频处理流水线设计

> 基于 Node.js + Python + gRPC 的实时语音处理系统，集成 Twilio Media Streams 和 Silero VAD。

---

## 1. 系统架构

### 1.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Next.js)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 通话控制按钮 │  │ VAD 状态显示 │  │ 转写文本显示 │  │ Agent 状态/Timeline │ │
│  └──────┬──────┘  └──────▲──────┘  └──────▲──────┘  └──────────▲──────────┘ │
│         │ HTTP/WS        │ WS             │ WS                  │ WS         │
│         │ 命令           │ 事件           │ 事件                │ 事件       │
└─────────┼────────────────┼────────────────┼─────────────────────┼───────────┘
          │                │                │                     │
          ▼                │                │                     │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Node.js media-service                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ HTTP API     │  │ Twilio REST  │  │ WS Server    │  │ 事件总线         │ │
│  │ (命令接收)   │  │ (发起呼叫)   │  │ (Media Stream)│  │ (normalize+推送) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                 │                    │           │
│         │    ┌────────────┴─────────────────┤                    │           │
│         │    │                              │                    │           │
│         │    ▼                              ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Session Manager                                   │   │
│  │  - 会话状态（callSid, streamSid, 通话方向等）                         │   │
│  │  - gRPC 连接管理（per-session）                                       │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │ gRPC bidi stream                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Python ai-audio-service                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ gRPC Server  │  │ 音频解码     │  │ Silero VAD   │  │ VAD 状态机       │ │
│  │ (bidi stream)│  │ μ-law→PCM    │  │ (ONNX)       │  │ (hysteresis)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 组件职责

| 组件 | 职责 | 不做什么 |
|------|------|----------|
| **Browser (Next.js)** | UI 展示、发送命令（开始/挂断/转接等） | 不处理音频、不直接连接 Twilio |
| **Node.js media-service** | 接收命令、调用 Twilio API、接收 Media Streams、转发音频、推送事件 | 不做音频 DSP、不跑 AI 模型 |
| **Python ai-audio-service** | 音频解码、重采样、VAD 推理、状态机判断 | 不做 Twilio 控制、不做 UI 推送 |

### 1.3 设计原则

1. **Browser 只是遥控器**：发命令、显示状态，不处理任何音频
2. **Node.js 是中枢**：所有 Twilio 交互、会话管理、事件分发都在这里
3. **Python 是 AI 引擎**：只关心音频处理和 AI 推理，返回结构化事件
4. **gRPC 双向流**：低延迟、强顺序、便于扩展

---

## 2. 呼叫流程

### 2.1 外呼（Outbound Call）时序图

```
Browser          media-service         Twilio            ai-audio-service
   │                  │                   │                      │
   │ POST /call/start │                   │                      │
   │ {to: "+1..."}    │                   │                      │
   │─────────────────>│                   │                      │
   │                  │                   │                      │
   │                  │ calls.create()    │                      │
   │                  │ url: /twiml/outbound                     │
   │                  │──────────────────>│                      │
   │                  │                   │                      │
   │                  │   TwiML request   │                      │
   │                  │<──────────────────│                      │
   │                  │                   │                      │
   │                  │ <Connect><Stream> │                      │
   │                  │──────────────────>│                      │
   │                  │                   │                      │
   │                  │ WebSocket connect │                      │
   │                  │<══════════════════│                      │
   │                  │                   │                      │
   │                  │ gRPC Stream open  │                      │
   │                  │═══════════════════════════════════════>│
   │                  │                   │                      │
   │  WS: call.started│                   │                      │
   │<─────────────────│                   │                      │
   │                  │                   │                      │
   │                  │ audio chunks      │                      │
   │                  │<══════════════════│                      │
   │                  │                   │                      │
   │                  │ gRPC AudioChunk   │                      │
   │                  │══════════════════════════════════════>│
   │                  │                   │                      │
   │                  │                   │    gRPC VadEvent     │
   │                  │<═══════════════════════════════════════│
   │                  │                   │                      │
   │  WS: vad.remote.start               │                      │
   │<─────────────────│                   │                      │
```

### 2.2 来电（Inbound Call）时序图

```
Twilio           media-service          Browser           ai-audio-service
   │                  │                    │                      │
   │ POST /twiml/inbound                   │                      │
   │ (incoming call)  │                    │                      │
   │─────────────────>│                    │                      │
   │                  │                    │                      │
   │ <Connect><Stream>│                    │                      │
   │<─────────────────│                    │                      │
   │                  │                    │                      │
   │ WebSocket connect│                    │                      │
   │══════════════════>                    │                      │
   │                  │                    │                      │
   │                  │ gRPC Stream open   │                      │
   │                  │════════════════════════════════════════>│
   │                  │                    │                      │
   │                  │ WS: call.incoming  │                      │
   │                  │───────────────────>│                      │
   │                  │                    │                      │
```

---

## 3. Twilio 集成

### 3.1 TwiML Webhook 端点

| 端点 | HTTP Method | 用途 |
|------|-------------|------|
| `/twiml/outbound` | POST | 外呼接通后返回 TwiML |
| `/twiml/inbound` | POST | 来电时返回 TwiML |
| `/twiml/redirect` | POST | 动态重定向（barge-in 等） |

### 3.2 TwiML 示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://your-domain.com/media">
      <Parameter name="callSid" value="{{CallSid}}" />
    </Stream>
  </Connect>
</Response>
```

### 3.3 Media Streams WebSocket 消息

**connected 消息**（握手完成）：
```json
{
  "event": "connected",
  "protocol": "Call",
  "version": "1.0.0"
}
```

**start 消息**（流开始）：
```json
{
  "event": "start",
  "sequenceNumber": "1",
  "start": {
    "streamSid": "MZxxx",
    "callSid": "CAxxxx",
    "tracks": ["inbound"],
    "mediaFormat": {
      "encoding": "audio/x-mulaw",
      "sampleRate": 8000,
      "channels": 1
    }
  }
}
```

**media 消息**（音频数据）：
```json
{
  "event": "media",
  "sequenceNumber": "2",
  "media": {
    "track": "inbound",
    "chunk": "1",
    "timestamp": "5",
    "payload": "base64-encoded-audio..."
  }
}
```

### 3.4 Twilio REST API 调用

| 操作 | API | 用途 |
|------|-----|------|
| 发起呼叫 | `calls.create()` | 外呼 |
| 挂断 | `calls(sid).update({status: 'completed'})` | 结束通话 |
| 重定向 | `calls(sid).update({url: '/twiml/redirect'})` | Barge-in 时停止播放 |

---

## 4. 音频处理流水线

### 4.1 数据流

```
Twilio Media Streams (WS)
         │
         ▼
    ┌─────────────┐
    │ μ-law 8kHz  │  base64 encoded, 20ms/frame (160 samples)
    └──────┬──────┘
           │ gRPC AudioChunk
           ▼
    ┌─────────────┐
    │ base64解码  │
    │ μ-law→PCM16 │  audioop.ulaw2lin()
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ 重采样 8k→16k│  soxr.resample() 或 scipy
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ 分帧缓冲    │  512 samples (32ms) per VAD frame
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ Silero VAD  │  ONNX Runtime
    │ 推理        │  输出: speech_probability ∈ [0,1]
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ 状态机      │  hysteresis + min_speech/silence
    └──────┬──────┘
           │
           ▼
    gRPC VadEvent (SPEECH_START / UPDATE / END)
```

### 4.2 采样率与帧长

| 阶段 | 采样率 | 帧长 | Samples/帧 |
|------|--------|------|------------|
| Twilio 原始 | 8 kHz | 20 ms | 160 |
| 重采样后 | 16 kHz | 20 ms | 320 |
| VAD 输入 | 16 kHz | 32 ms | 512 |

### 4.3 Silero VAD 配置

```python
# 模型加载
model = onnxruntime.InferenceSession("silero_vad.onnx")

# 推理参数
SAMPLE_RATE = 16000
WINDOW_SIZE = 512  # 32ms @ 16kHz

# 状态机参数
START_THRESHOLD = 0.6   # 开始说话阈值
END_THRESHOLD = 0.3     # 结束说话阈值
MIN_SPEECH_MS = 200     # 最短语音时长
MIN_SILENCE_MS = 300    # 最短静音时长
```

---

## 5. gRPC 接口规范

### 5.1 Proto 定义

```protobuf
syntax = "proto3";

package audioai;

service AudioAI {
  // 双向流：音频输入，VAD 事件输出
  rpc Stream(stream AudioChunk) returns (stream AiEvent);
}

// 音频编码格式
enum Codec {
  CODEC_UNSPECIFIED = 0;
  MULAW_8K = 1;      // μ-law 8kHz (Twilio 原始)
  PCM16_8K = 2;      // PCM16 8kHz
  PCM16_16K = 3;     // PCM16 16kHz
}

// 音频块 (Node → Python)
message AudioChunk {
  string session_id = 1;      // 会话唯一标识
  uint32 seq = 2;             // 帧序号
  Codec codec = 3;            // 编码格式
  bytes payload = 4;          // 音频数据 (raw bytes, not base64)
  uint64 timestamp_ms = 5;    // 相对通话开始的时间戳
  string track = 6;           // "inbound" (remote) 或 "outbound" (local)
}

// VAD 事件类型
enum VadEventType {
  VAD_EVENT_UNSPECIFIED = 0;
  SPEECH_START = 1;           // 开始说话
  SPEECH_UPDATE = 2;          // 说话中（概率更新）
  SPEECH_END = 3;             // 结束说话
}

// AI 事件 (Python → Node)
message AiEvent {
  string session_id = 1;
  uint64 timestamp_ms = 2;
  
  oneof event {
    VadEvent vad = 10;
    // 未来扩展: AsrEvent asr = 11;
    // 未来扩展: ClassifyEvent classify = 12;
  }
}

// VAD 事件
message VadEvent {
  VadEventType type = 1;
  float probability = 2;      // 当前帧概率
  string track = 3;           // "inbound" 或 "outbound"
}
```

### 5.2 事件命名映射

| gRPC 事件 | track | UI 事件 | 说明 |
|-----------|-------|---------|------|
| `SPEECH_START` | inbound | `vad.remote.start` | 对方开始说话 |
| `SPEECH_UPDATE` | inbound | `vad.remote.update` | 对方说话中 |
| `SPEECH_END` | inbound | `vad.remote.end` | 对方停止说话 |
| `SPEECH_START` | outbound | `vad.local.start` | 本地开始说话 |
| `SPEECH_UPDATE` | outbound | `vad.local.update` | 本地说话中 |
| `SPEECH_END` | outbound | `vad.local.end` | 本地停止说话 |

---

## 6. Barge-in 机制

### 6.1 时序图

```
ai-audio-service    media-service         Twilio            Browser
       │                  │                  │                  │
       │                  │ <Play> TTS 播放中 │                  │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │ SPEECH_START     │                  │                  │
       │ (track: inbound) │                  │                  │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │                  │ calls.update()   │                  │
       │                  │ url: /twiml/redirect               │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │ 停止播放，继续 <Stream>              │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │                  │ WS: agent.interrupted              │
       │                  │──────────────────────────────────>│
       │                  │                  │                  │
```

### 6.2 Barge-in TwiML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://your-domain.com/media" />
  </Connect>
</Response>
```

### 6.3 触发条件

- VAD 检测到 `SPEECH_START` (track: inbound)
- 当前 Agent 状态为 `SPEAKING`
- 立即触发 redirect，优先级高于 Agent 回复

---

## 7. 错误处理

### 7.1 异常场景

| 场景 | 检测方式 | 处理策略 |
|------|----------|----------|
| gRPC 连接断开 | `on('error')` / `on('end')` | 重连，最多 3 次，间隔 1s |
| Python 服务崩溃 | gRPC 超时 (5s) | 降级：跳过 VAD，直接转发 |
| 音频帧丢失 | seq 不连续 | 记录日志，继续处理 |
| Twilio WS 断开 | `on('close')` | 标记会话结束 |
| 音频解码失败 | exception | 跳过该帧，记录日志 |

### 7.2 超时配置

| 操作 | 超时 | 说明 |
|------|------|------|
| gRPC 连接 | 5s | 初始连接 |
| gRPC 单帧处理 | 100ms | 每帧最大处理时间 |
| Twilio REST API | 10s | 呼叫发起等 |

---

## 8. 性能指标

### 8.1 延迟目标

| 路径 | 目标延迟 | 说明 |
|------|----------|------|
| 音频到达 → VAD 事件 | < 50ms | 端到端 VAD 延迟 |
| VAD 事件 → UI 更新 | < 20ms | 事件推送延迟 |
| SPEECH_START → Barge-in | < 100ms | 打断响应时间 |

### 8.2 资源估算

| 组件 | CPU | 内存 | 并发通话 |
|------|-----|------|----------|
| media-service | 0.5 核 | 256MB | 100 路 |
| ai-audio-service | 1 核 | 512MB | 50 路 |

---

## 9. 环境配置

### 9.1 环境变量

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+15550001111

# 服务端口
MEDIA_SERVICE_PORT=4001
MEDIA_WS_PATH=/media

# Python gRPC
AI_AUDIO_GRPC_URL=localhost:50051

# 公网地址（用于 Twilio Webhook）
PUBLIC_BASE_URL=https://your-domain.ngrok-free.app
```

### 9.2 本地开发

```bash
# 1. 启动 ngrok
ngrok http 4001

# 2. 设置 PUBLIC_BASE_URL 为 ngrok 地址

# 3. 启动 Python VAD 服务
python apps/ai-audio-service/ai_audio_service/main.py

# 4. 启动 Node media-service
pnpm --filter media-service dev

# 5. 启动 Web UI
pnpm --filter web dev
```

---

## 10. 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 包管理 | pnpm workspaces | 8+ |
| 前端 | Next.js (App Router) | 14+ |
| 状态管理 | XState | 5+ |
| Node 后端 | Node.js | 18+ |
| Python 后端 | Python | 3.10+ |
| gRPC | grpcio / @grpc/grpc-js | latest |
| VAD 模型 | Silero VAD (ONNX) | v5 |
| 音频处理 | soxr / audioop | - |

---

## 11. 待办事项

- [x] 定义 proto 文件
- [ ] Node: Twilio Media Streams → gRPC 转发
- [ ] Python: gRPC server + Silero VAD 推理
- [ ] VAD 状态机（hysteresis）
- [ ] Barge-in 实现
- [ ] 错误重连机制
- [ ] 性能测试与调优
