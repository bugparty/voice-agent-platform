# 麦克风处理逻辑快速参考

## 核心逻辑 (5 步)

### 1️⃣ 检查 Session
```typescript
if (!callState.sessionId) {
  setError("No active call session");
  return;
}
```

### 2️⃣ 请求麦克风权限
```typescript
const permission = await requestMicPermission();
// ↓
navigator.mediaDevices.getUserMedia({ audio: true })
// ↓ 浏览器显示权限弹窗
// ↓ 获取 MediaStream
// ↓ 记录 track 信息
// ↓ 立即停止所有 tracks (关键！)
stream.getTracks().forEach(track => track.stop());
```

**为什么立即停止？**
- 我们只是为了获取权限，不是要持续使用麦克风
- 真正的音频流由 Twilio Voice SDK 管理
- 避免麦克风被两个流同时占用

### 3️⃣ 获取 Token
```typescript
const tokenRes = await fetch(`${baseUrl}/token`, {
  method: "POST",
  body: JSON.stringify({
    identity: `user_${Date.now()}`,
    sessionId: callState.sessionId,
  }),
});
```

### 4️⃣ 初始化 Twilio Device
```typescript
await initDevice(tokenData.token, callbacks);
// ↓
new Device(token, { codecPreferences: [Opus, PCMU] })
// ↓
device.register() // 注册到 Twilio
```

### 5️⃣ 加入 Conference
```typescript
await joinConference(callState.sessionId);
// ↓
device.connect({ params: { sessionId }})
// ↓ Twilio 请求 /twiml/webJoin
// ↓ 返回 Conference TwiML
// ↓ WebRTC 连接建立
// ✓ 用户音频进入 Conference
```

---

## 日志检查点

### ✅ 成功标记
```
[Audio Permissions] ✓ Permission GRANTED
[Twilio Device] ✓ Device registered successfully
[Twilio Call] ✓ Connection established
[Twilio Call] ✓ Call ACCEPTED
[Web UI] ===== Join Conference Flow Success =====
```

### ❌ 失败标记
```
[Audio Permissions] ✗ Permission request failed
[Audio Permissions] User denied permission
[Twilio Device] ✗ Registration failed
[Twilio Call] ✗ Connection failed
```

---

## 状态变化

### Device Status
```
disconnected → connecting → connected → calling → in-call
```

### 关键回调
- `onStatusChange(status)` - 状态改变
- `onError(error)` - 错误发生
- `onCallDisconnected()` - 通话断开

---

## 常见问题

| 问题 | 日志特征 | 解决方法 |
|------|---------|---------|
| 权限被拒绝 | `User denied permission` | 浏览器设置允许麦克风 |
| Token 错误 | `Token generation not configured` | 配置环境变量 |
| 连接失败 | `Connection failed` | 检查 TwiML App 配置 |

---

## 关键文件

- `apps/web/src/app/page.tsx` - 主流程
- `apps/web/src/lib/permissions/audio.ts` - 权限管理
- `apps/web/src/lib/twilio/device.ts` - Twilio 设备管理

---

## 详细文档

完整流程和日志说明见：[`mic-flow-logging.md`](mic-flow-logging.md)
