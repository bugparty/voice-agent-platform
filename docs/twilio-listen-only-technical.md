# Twilio Voice SDK 仅收听模式技术说明

## 问题

错误 `AcquisitionFailedError (31402)` 表示：
- 浏览器和用户都允许了权限
- 但获取媒体流失败

这是因为 **Twilio Voice SDK 默认会尝试获取麦克风**，即使没有麦克风或权限被拒绝。

---

## 解决方案：rtcConstraints

Twilio Voice SDK **完全支持**仅收听模式（无麦克风），但需要显式配置。

### 关键配置：rtcConstraints.audio

```typescript
// ❌ 错误：默认配置会尝试获取麦克风
await device.connect({
  params: { sessionId }
});
// 如果没有麦克风 → AcquisitionFailedError (31402)

// ✅ 正确：显式禁用麦克风
await device.connect({
  params: { sessionId },
  rtcConstraints: {
    audio: false  // 不请求麦克风
  }
});
// 没有麦克风也能成功连接（仅收听模式）
```

---

## 我们的实现

### 1. joinConference 函数签名

```typescript
export async function joinConference(
  sessionId: string, 
  audioEnabled: boolean = true
): Promise<Call>
```

### 2. 根据权限决定是否启用音频

```typescript
// 在 page.tsx 中
const permission = await requestMicPermission();

// 传递 audioEnabled 参数
await joinConference(
  callState.sessionId, 
  permission === "granted"  // 有权限 → true, 无权限 → false
);
```

### 3. 动态设置 rtcConstraints

```typescript
// 在 device.ts 中
const connectOptions: any = {
  params: { sessionId },
};

if (!audioEnabled) {
  // 仅收听模式：禁用音频输入
  connectOptions.rtcConstraints = {
    audio: false,
  };
}

activeCall = await device.connect(connectOptions);
```

---

## 工作流程

### 场景 A：有麦克风权限

```
用户点击 Join Conference
  ↓
请求麦克风权限 → granted
  ↓
joinConference(sessionId, audioEnabled: true)
  ↓
device.connect({ 
  params: { sessionId },
  // rtcConstraints 不设置，使用默认（audio: true）
})
  ↓
✅ 双向音频：可以听 + 可以说
```

### 场景 B：无麦克风权限

```
用户点击 Join Conference
  ↓
请求麦克风权限 → denied
  ↓
joinConference(sessionId, audioEnabled: false)
  ↓
device.connect({ 
  params: { sessionId },
  rtcConstraints: { audio: false }  // 关键！
})
  ↓
✅ 单向音频：可以听 + 不能说（仅收听模式）
```

---

## Twilio Voice SDK 文档参考

### device.connect() 选项

```typescript
interface ConnectOptions {
  params?: Record<string, string>;           // 传递给 TwiML 的参数
  rtcConstraints?: MediaStreamConstraints;   // WebRTC 约束
  rtcConfiguration?: RTCConfiguration;       // WebRTC 配置
}

interface MediaStreamConstraints {
  audio?: boolean | MediaTrackConstraints;   // 音频约束
  video?: boolean | MediaTrackConstraints;   // 视频约束（Voice SDK 不支持）
}
```

### audio 约束的三种值

| 值 | 含义 | 用途 |
|----|------|------|
| `true` (默认) | 请求默认麦克风 | 正常通话模式 |
| `false` | 不请求麦克风 | 仅收听模式 |
| `MediaTrackConstraints` | 详细约束（设备 ID、采样率等） | 高级场景 |

---

## 调试日志

### 正常模式（有麦克风）

```
[Twilio Call] ===== Joining Conference =====
[Twilio Call] Session ID: sess_xxx
[Twilio Call] Audio enabled: true
[Twilio Call] Device state: registered
[Twilio Call] Initiating connection...
[Twilio Call] Connecting with microphone enabled
[Twilio Call] ✓ Connection established
```

### 仅收听模式（无麦克风）

```
[Twilio Call] ===== Joining Conference =====
[Twilio Call] Session ID: sess_xxx
[Twilio Call] Audio enabled: false
[Twilio Call] Device state: registered
[Twilio Call] Initiating connection...
[Twilio Call] Connecting in LISTEN-ONLY mode (no microphone)
[Twilio Call] ✓ Connection established
```

---

## WebRTC 音频流说明

### 正常模式

```
                   ┌────────────┐
                   │  Browser   │
                   └────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ↓                ↓                ↓
  Microphone         Audio Out         WebRTC
    (input)          (output)       Connection
        │                ↑                │
        └────────────────┴────────────────┘
                         │
                    To Conference
```

- **发送轨道（Send Track）**: ✅ 有（从麦克风）
- **接收轨道（Receive Track）**: ✅ 有（到扬声器）

### 仅收听模式

```
                   ┌────────────┐
                   │  Browser   │
                   └────────────┘
                         │
                         ↓
                     Audio Out         WebRTC
                     (output)       Connection
                         ↑                │
                         └────────────────┘
                                │
                           To Conference
```

- **发送轨道（Send Track）**: ❌ 无
- **接收轨道（Receive Track）**: ✅ 有（到扬声器）

---

## 常见问题

### Q1: 仅收听模式下能听到声音吗？

**A:** ✅ 可以！仅收听模式只是禁用了**发送音频**（麦克风），但**接收音频**（扬声器）仍然正常工作。

### Q2: 对方能听到我说话吗？

**A:** ❌ 不能。在仅收听模式下，你的麦克风不会被激活，对方听不到任何声音。

### Q3: 可以动态切换吗？

**A:** ❌ 不能。一旦连接建立，音频约束就固定了。要切换模式需要：
1. 断开当前连接（Leave）
2. 重新连接（Join）并使用不同的 `audioEnabled` 参数

### Q4: Mute 按钮在仅收听模式下有用吗？

**A:** ❌ 无效。因为根本没有音频轨道发送，静音与否都一样。

### Q5: 浏览器兼容性如何？

**A:** ✅ 所有支持 WebRTC 的现代浏览器都支持：
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 最佳实践

### 1. 总是根据权限设置 audioEnabled

```typescript
const permission = await requestMicPermission();
const audioEnabled = permission === "granted";
await joinConference(sessionId, audioEnabled);
```

### 2. 提供清晰的 UI 提示

```typescript
if (!audioEnabled) {
  console.warn("⚠️ Joining in listen-only mode");
  // 显示 UI 提示：仅收听模式
}
```

### 3. 记录音频状态

```typescript
console.log("[Twilio Call] Audio enabled:", audioEnabled);
// 便于调试和故障排查
```

---

## 性能对比

| 模式 | 麦克风激活 | CPU 占用 | 带宽占用 |
|------|-----------|---------|---------|
| 正常模式 | ✅ 是 | 中等 | 双向（发送+接收） |
| 仅收听模式 | ❌ 否 | 较低 | 单向（仅接收） |

**结论：** 仅收听模式性能更好，因为不需要：
- 音频采集
- 音频编码
- 上行带宽

---

## 总结

✅ **Twilio 完全支持无麦克风的仅收听模式**  
✅ **关键是设置 `rtcConstraints.audio = false`**  
✅ **我们的实现根据权限自动选择模式**  
✅ **无需用户手动配置**  

现在即使没有麦克风或拒绝权限，也能成功加入通话并听到声音！
