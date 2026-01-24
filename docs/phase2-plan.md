# Phase 2: Twilio Conference + Web 语音接入实现计划

> 目标：将 Twilio Conference 集成到 Node.js media-service，并在 Web UI 实现基于 Twilio Voice SDK 的麦克风/扬声器功能，使用户能够通过浏览器加入通话与 PSTN 被叫方直接对话。

---

## 0. 架构概览

### 两条音频路径

| 方向 | 音频路径 | Node.js 角色 |
|------|----------|--------------|
| **用户说话 → PSTN** | Web → Twilio (WebRTC) → Conference → PSTN | 只提供 Token，不经手音频 |
| **PSTN → AI 分析** | PSTN → Media Streams → Node → Python | 转发音频到 AI |
| **PSTN → 用户听** | Conference → Twilio (WebRTC) → Web | 不经手音频 |

### 时序图

```
User (Web UI)          media-service          Twilio              PSTN Callee
     │                      │                   │                      │
     │ POST /call/start     │                   │                      │
     │─────────────────────>│                   │                      │
     │                      │ calls.create      │                      │
     │                      │──────────────────>│                      │
     │                      │                   │ GET /twiml/outbound  │
     │                      │<──────────────────│                      │
     │                      │ TwiML (Conf+Stream)                      │
     │                      │──────────────────>│                      │
     │                      │                   │ PSTN dial            │
     │                      │                   │─────────────────────>│
     │                      │ WS /media         │                      │
     │                      │<──────────────────│ Media Streams        │
     │                      │                   │                      │
     │ POST /token          │                   │                      │
     │─────────────────────>│                   │                      │
     │ Access Token         │                   │                      │
     │<─────────────────────│                   │                      │
     │                      │                   │                      │
     │ Voice SDK connect    │                   │                      │
     │─────────────────────────────────────────>│                      │
     │                      │ GET /twiml/webJoin│                      │
     │                      │<──────────────────│                      │
     │                      │ TwiML (join conf) │                      │
     │                      │──────────────────>│                      │
     │                      │                   │                      │
     │<═══════════════════ WebRTC audio ═══════════════════════════════>│
```

---

## 1. Node.js media-service 改造

### 1.1 Session Store 扩展

扩展 `apps/media-service/src/sessions/sessionStore.js`，增加 conference 相关字段：

```javascript
{
  sessionId,      // UUID (新增)
  confName,       // conference 名称 (新增)
  callSid,        // PSTN leg
  streamSid,      // Media Streams
  webCallSid,     // Web leg - 用户加入后 (新增)
  state,          // CALLING | IN_CALL | USER_JOINED | USER_LEFT | ENDING (新增)
  createdAt,
  callStartAt,
  lastAudioAt,
  grpcStream,
  seq
}
```

### 1.2 TwiML 端点重构

修改 `apps/media-service/src/twilio/twiml.js`，拆分为两个 TwiML 生成器：

#### buildOutboundConferenceTwiml(session)

PSTN leg 加入 conference + 启动 Media Stream：

```xml
<Response>
  <Start>
    <Stream url="wss://YOUR_PUBLIC_BASE/media">
      <Parameter name="session_id" value="{{SESSION_ID}}" />
    </Stream>
  </Start>
  <Dial>
    <Conference>{{CONF_NAME}}</Conference>
  </Dial>
</Response>
```

#### buildWebJoinConferenceTwiml(session)

Web leg 加入同一 conference：

```xml
<Response>
  <Dial>
    <Conference>{{CONF_NAME}}</Conference>
  </Dial>
</Response>
```

### 1.3 新增 API 端点

在 `apps/media-service/src/index.js` 添加：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/twiml/outbound` | POST | PSTN 接通后返回 Conference TwiML |
| `/twiml/webJoin` | POST | Web SDK 连接时返回 Conference TwiML |
| `/token` | POST | 为 Web 端生成 Twilio Access Token |

### 1.4 Token 生成

使用 `twilio.jwt.AccessToken` 生成带 Voice Grant 的 token：

```javascript
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

function generateToken(identity) {
  const token = new AccessToken(
    config.twilioAccountSid,
    config.twilioApiKey,
    config.twilioApiSecret,
    { identity }
  );
  
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: config.twilioTwimlAppSid,
    incomingAllow: false
  });
  
  token.addGrant(voiceGrant);
  return token.toJwt();
}
```

---

## 2. Web UI 实现

### 2.1 安装依赖

```bash
cd apps/web
pnpm add @twilio/voice-sdk
```

### 2.2 Twilio Device 管理模块

创建 `apps/web/src/lib/twilio/device.ts`：

```typescript
import { Device, Call } from '@twilio/voice-sdk';

let device: Device | null = null;
let activeCall: Call | null = null;

export async function initDevice(token: string): Promise<Device> {
  device = new Device(token, {
    codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU]
  });
  
  await device.register();
  return device;
}

export async function joinConference(sessionId: string): Promise<Call> {
  if (!device) throw new Error('Device not initialized');
  
  activeCall = await device.connect({
    params: { sessionId }
  });
  
  return activeCall;
}

export function leaveConference(): void {
  activeCall?.disconnect();
  activeCall = null;
}

export function toggleMute(): boolean {
  if (!activeCall) return false;
  const isMuted = activeCall.isMuted();
  activeCall.mute(!isMuted);
  return !isMuted;
}

export function getDevice(): Device | null {
  return device;
}
```

### 2.3 Audio 权限管理

创建 `apps/web/src/lib/permissions/audio.ts`：

```typescript
export type PermissionState = 'granted' | 'prompt' | 'denied';

export async function requestMicPermission(): Promise<PermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return 'granted';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return 'denied';
    }
    throw err;
  }
}

export async function getAudioDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
}
```

### 2.4 UI 控件扩展

在 `apps/web/src/app/page.tsx` 添加：

- **Join / Leave 按钮** - 用户加入/离开通话
- **Mute 按钮** - 麦克风静音
- **设备选择器** - 选择麦克风/扬声器 (可选)
- **连接状态指示** - 显示 Web leg 连接状态

---

## 3. 环境配置

### 3.1 新增环境变量

在 `apps/media-service/src/config/env.js` 添加：

```
TWILIO_TWIML_APP_SID    # TwiML App SID (需在 Twilio Console 创建)
TWILIO_API_KEY          # API Key
TWILIO_API_SECRET       # API Secret
```

### 3.2 Twilio Console 配置

1. **创建 TwiML App**
   - 进入 Twilio Console → Voice → TwiML Apps
   - 创建新 App，Voice URL 设置为 `https://YOUR_PUBLIC_BASE/twiml/webJoin`
   - 记录 App SID

2. **创建 API Key**
   - 进入 Twilio Console → Account → API Keys
   - 创建 Standard API Key
   - 记录 Key SID 和 Secret

---

## 4. 事件流完善

扩展事件类型支持 conference 状态：

```javascript
// 新增事件类型
'conference.user.joined'   // 用户加入
'conference.user.left'     // 用户离开
'conference.user.muted'    // 用户静音
'conference.user.unmuted'  // 用户取消静音
```

---

## 5. 实现顺序

| 序号 | 任务 | 依赖 |
|------|------|------|
| 1 | 扩展 sessionStore.js 增加 confName/sessionId/state 字段 | - |
| 2 | 重构 twiml.js 支持 Conference + Stream 组合 TwiML | - |
| 3 | 添加 /twiml/outbound 端点处理 PSTN leg 加入 conference | 1, 2 |
| 4 | 在 Twilio Console 创建 TwiML App 和 API Key | - |
| 5 | 添加 /token 端点生成 Twilio Access Token | 1, 4 |
| 6 | 添加 /twiml/webJoin 端点处理 Web leg 加入 conference | 2 |
| 7 | 创建 Web Twilio Device 管理模块 (device.ts) | 5 |
| 8 | 创建麦克风权限管理模块 (audio.ts) | - |
| 9 | 实现 Join/Leave/Mute 按钮和设备选择 UI | 7, 8 |
| 10 | 扩展事件总线支持 conference 状态事件 | 6 |

---

## 6. 验收标准

1. ✅ 点击 Call：PSTN 被叫接通，UI 显示 `IN_CALL`
2. ✅ 点击 Join：用户麦克风接入，被叫能听到用户说话
3. ✅ 点击 Mute：被叫听不到用户
4. ✅ 点击 Leave：用户退出但 PSTN 通话保持
5. ✅ 点击 Hangup：整个通话结束

---

## 7. 后续扩展 (不在 Phase 2 范围)

- AI TTS 输出到 PSTN (方案 A: TwiML 重定向 / 方案 B: 双向 Media Streams)
- DTMF 键盘 (UI → Node → Twilio)
- 本地 VAD (需要额外的 Media Stream 或本地处理)
- 通话录音
