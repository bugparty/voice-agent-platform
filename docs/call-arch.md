# 外呼 PSTN + 用户语音接管：实现指南

> 目标：
>
> * **Node.js media-service** 负责外呼、通话编排、Media Streams、事件分发
> * **Web UI** 只提供按钮（Call/Join/Mute/Hangup/DTMF/Agent Start-Pause…），用户语音直接进通话
> * **Python ai-audio-service** 只做音频 AI（VAD/ASR/分类），只输出事件，不控制通话
>
> 关键原则：
>
> * **“给 AI 听”** 走 Media Streams（出口）
> * **“给对方听”** 走 Voice JS SDK（WebRTC → Twilio → PSTN），不要试图把麦克风音频塞回 Media Streams

---

## 1. 高层架构

### 1.1 组件职责

* **Web (Next.js)**

  * 展示状态（call / vad / asr / agent）
  * 提供按钮和输入（DTMF、命令、Join/Leave）
  * 使用 **Twilio Voice JS SDK** 加入通话（把用户麦克风送进通话）

* **Node media-service**

  * 外呼 PSTN（calls.create）
  * 下发 TwiML（把 PSTN leg 接入桥接）
  * 启用 Media Streams，把 PSTN 音频实时推给自身 WS
  * 把 WS 音频转发给 Python（gRPC bidi）
  * 把 AI 事件与 Twilio 事件 normalize 后推给 Web（WS/SSE）

* **Python ai-audio-service**

  * μ-law 解码 / 重采样 / VAD/ASR
  * 输出结构化事件（vad.remote.start/end、asr.remote.partial/final…）

### 1.2 两条音频路径（必须区分）

* **路径 A：监听（给 AI 听）**

  * PSTN/Conference → Twilio Media Streams → Node WS → Python gRPC → AI events → Web UI

* **路径 B：讲话（给对方听）**

  * Web 麦克风 → Twilio Voice JS SDK（WebRTC）→ Twilio 桥接（Conference 推荐）→ PSTN

---

## 2. 推荐桥接方式：Conference

> 为什么推荐：
>
> * 让 **PSTN 被叫** 和 **Web 用户** 同时加入一个房间
> * 你的 UI 只需要一个 Join/Leave 按钮即可实现“接管说话”
> * 更贴近你当前的“Agent 默认不说话，只辅助”的产品边界

### 2.1 最小流程

1. 用户点击 **Call**

* Node 创建 `session_id` 和 `conf_name`
* Node 外呼 PSTN，被叫接起后，通过 TwiML 把 PSTN leg 加入 conference
* 同时开启 Media Streams（监听 PSTN / 或监听 conference 的某个 leg）

2. 用户点击 **Join**

* Web 从 Node 拿 token
* Web 用 Voice JS SDK `device.connect()` 加入同一个 conference
* 此后用户的麦克风音频就能直接进 PSTN

3. 用户点击 **Mute / Unmute / Leave**

* 都是 Web 端对本地麦克风 track 的控制（或 Twilio SDK 自带 mute）

---

## 3. Node 实现清单（media-service）

### 3.1 需要的端点

* `POST /call/start`

  * 入参：`to`（电话号码）
  * 输出：`{ session_id, conf_name, callSid }`

* `POST /twiml/outbound`

  * Twilio 外呼接通后回调，返回 TwiML
  * 目标：将 PSTN leg 加入 `conf_name`，并启用 `<Stream>`

* `POST /token`

  * Web join 时调用，返回 Twilio access token
  * token 内需要能让 Web 端“拨号”到一个 TwiML App/Voice URL（或直接 dial conference）

* `WS /media`

  * Twilio Media Streams 连接入口
  * 接收 `connected/start/media/stop` 消息
  * 对 `media.payload` 做 base64 decode，得到 μ-law bytes
  * 转成 `AudioChunk` 发给 Python gRPC

* `WS/SSE /events`

  * 把 normalize 后的事件推给 Web

### 3.2 Session 结构（最小字段）

* `session_id`
* `conf_name`
* `callSid`（PSTN leg）
* `streamSid`（Media Streams）
* `grpc_stream`（到 Python 的 bidi stream）
* `state`（CALLING/IN_CALL/USER_JOINED/USER_LEFT/ENDING…）

### 3.3 TwiML：PSTN leg 加入 conference + Stream

> 说明：示例强调结构，字段你可按实际需要补 `statusCallback`、`record`、`beep` 等。

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR_PUBLIC_BASE/media">
      <Parameter name="session_id" value="{{SESSION_ID}}" />
      <Parameter name="role" value="pstn" />
    </Stream>
  </Connect>

  <Dial>
    <Conference>
      {{CONF_NAME}}
    </Conference>
  </Dial>
</Response>
```

> 备注：
>
> * 真实实现里通常会把 `<Stream>` 和 `<Conference>` 的时机、顺序做精细控制。
> * 你也可以让 PSTN leg 先进入 conference，然后在 conference/participant 上单独开 stream（看你要监听哪条腿）。

### 3.4 Web join conference 的“拨号目标”

思路：让 Web 端 `device.connect()` 触发 Twilio 请求 Node 的某个 TwiML endpoint，Node 返回“把此 Web leg 加入同一个 conference”。

```xml
<Response>
  <Dial>
    <Conference>
      {{CONF_NAME}}
    </Conference>
  </Dial>
</Response>
```

Web 端在 `connect` 时带上 `conf_name/session_id` 作为 params，Node 用它生成 TwiML。

---

## 4. Web 实现清单（Next.js UI）

### 4.1 UI 只需要的核心按钮

* **Call**：触发 `POST /call/start`
* **Join**：拿 token，初始化 Device，`device.connect({ params: { conf_name, session_id }})`
* **Leave**：断开 connection
* **Mute**：静音本地麦克风
* **Hangup**：触发 Node `POST /call/hangup`（可选）
* **DTMF keypad**：对 PSTN leg 发送 DTMF（Node 负责）
* **Agent Start/Pause**：仅切状态（Node 控制是否允许自动 DTMF/播放提示）

### 4.2 UI 事件驱动

Web 不维护“真实通话状态”，只消费 Node 推来的事件：

* `twilio.call.status`（connecting/in_call/ended）
* `vad.remote.*` / `vad.local.*`
* `asr.remote.*` / `asr.local.*`
* `agent.phase` / `agent.plan` / `agent.speak.*`

---

## 5. Python 实现清单（ai-audio-service）

### 5.1 gRPC bidi

* 输入：`AudioChunk(session_id, seq, codec=MULAW_8K, payload, timestamp_ms, track)`
* 输出：`AiEvent(vad=..., asr=...)`

### 5.2 track 语义建议

* `track = "remote"`：对方（PSTN 被叫/客服）
* `track = "local"`：本地（用户麦克风 / 或 Twilio leg 的 outbound）

> 注意：
>
> * 如果你只对 PSTN 做 Media Streams，你拿到的可能主要是对方方向（inbound）。
> * 想让 AI 同时看到用户说话，需要额外对 Web leg 开 stream，或在 Web 本地另开上传（不推荐）。

---

## 6. Agent 只需要按钮：最小控制面

> 你当前产品边界：
>
> * Agent 默认不说话
> * Agent 只在用户点按钮时做“可解释、可撤销”的动作

### 6.1 建议的按钮动作集合

* `agent.navigate_ivr_step`：按既定规则发一串 DTMF
* `agent.force_bargein`：停止播放/redirect
* `agent.pause`：完全停止自动动作

### 6.2 Node 侧硬边界（强制）

* 进入 `IDENTITY_VERIFICATION` 或 `HUMAN_REACHED` 时：

  * 强制 `agent.pause`
  * 禁止自动 DTMF
  * 禁止自动 TTS 注入
  * 仅允许字幕/提示（copilot）

---

## 7. 最小验收（MVP Checklist）

1. 点击 Call：PSTN 被叫手机响铃并接通
2. UI 能看到 `callSid`、`in_call` 状态
3. Media Streams WS 收到 `start/media`，Python VAD 能吐 `vad.remote.start/end`
4. 点击 Join：用户对着麦克风说话，被叫能听到
5. 点击 Mute：被叫听不到用户
6. 点击 Hangup：通话结束，WS/gRPC 清理

---

## 8. 常见坑（提前避雷）

* 不要把“用户麦克风音频”当成 Media Streams 的输入：Media Streams 是**输出给你监听**。
* Conference 方案里，TwiML 端点要区分：

  * PSTN leg 加入 conference
  * Web leg 加入 conference
* 如果发现 AI 只能听到对方、听不到本地：这是预期；想两边都听要专门设计。
* 状态清理要做：Twilio WS close、gRPC end、sessionStore 清理。

---

## 9. 你可以直接照着落代码的目录落点（建议）

* `apps/media-service/src/twilio/twiml.ts`

  * `renderOutboundToConference(session)`
  * `renderWebJoinConference(session)`
* `apps/media-service/src/twilio/mediaWsServer.ts`

  * `onMediaMessage(session, msg)`
* `apps/media-service/src/sessions/sessionStore.ts`
* `apps/web/src/lib/twilio/device.ts`

  * `initDevice(token)`
  * `joinConference(confName, sessionId)`

---

## 10. 下一步扩展（可选）

* 加 `DTMF keypad`（UI → Node → Twilio）用于手动过 IVR
* 加 `beep/busy/ivr detector` 分类
* 加 `barge-in`（VAD 检测对方说话就 redirect 停止播放）
* 加 `event-schema` 和 UI timeline 过滤器
