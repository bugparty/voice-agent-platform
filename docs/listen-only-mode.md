# 仅收听模式（Listen-Only Mode）

如果没有麦克风或者只想听不想说话，可以使用"仅收听模式"加入通话。

---

## 功能说明

### 正常模式 vs 仅收听模式

| 模式 | 麦克风 | 能听到 PSTN | 能被 PSTN 听到 | 适用场景 |
|------|--------|------------|---------------|---------|
| **正常模式** | ✅ 有权限 | ✅ 是 | ✅ 是 | 与被叫方双向对话 |
| **仅收听模式** | ❌ 无权限/无设备 | ✅ 是 | ❌ 否 | 只监听通话内容 |

---

## 使用方法

### 自动检测

系统会自动检测麦克风权限状态：

1. **点击 Join Conference**
2. 系统尝试申请麦克风权限
3. 如果权限被拒绝或无麦克风设备：
   - 显示黄色提示：⚠️ "没有麦克风权限，将以'仅收听'模式加入"
   - **自动继续**加入 Conference（不会中断）
4. 加入成功后显示：⚠️ 仅收听模式（无麦克风）

### UI 提示

```
┌─────────────────────────────────────────┐
│ User Controls                            │
│ Join the conference to speak with...    │
│                                          │
│ ⚠️ 提示：没有麦克风权限，将以"仅收听"  │
│    模式加入（只能听，不能说话）         │
│                                          │
│ [Join Conference] [Leave] [Mute]        │
│                                          │
│ Session: sess_xxx                        │
│ Conference: conf_xxx                     │
│ ⚠️ 仅收听模式（无麦克风）               │
└─────────────────────────────────────────┘
```

---

## 技术实现

### 1. 跳过麦克风权限检查

```javascript
// 之前：权限失败则中断
if (permission !== "granted") {
  setError("Microphone permission denied");
  return;  // ❌ 停止
}

// 现在：权限失败继续进行
if (permission !== "granted") {
  console.warn("Continuing in listen-only mode");
  // ✅ 继续加入 Conference
}
```

### 2. Twilio Device 配置

Twilio Voice SDK 支持无麦克风连接：

```typescript
device = new Device(token, {
  codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
  enableImprovedSignalingErrorPrecision: true,
  // 允许无麦克风连接
});
```

### 3. WebRTC 音频流

- **正常模式**: 双向音频流（发送 + 接收）
- **仅收听模式**: 单向音频流（仅接收）

Twilio 会自动处理音频流的方向，无需额外配置。

---

## 日志示例

### 仅收听模式日志

```
[Web UI] ===== Join Conference Flow Start =====
[Web UI] Step 1: Checking session { sessionId: "sess_...", ... }
[Web UI] Step 2: Requesting microphone permission...
[Audio Permissions] Requesting microphone access...
[Audio Permissions] ✗ Permission request failed: DOMException: Permission denied
[Audio Permissions] User denied permission
[Web UI] Microphone permission result: denied
[Web UI] ⚠️ Microphone not available, continuing in listen-only mode
[Web UI] User will be able to hear but not speak
[Web UI] Step 3: Requesting token from backend...
[Twilio Device] ===== Initializing Device =====
[Twilio Device] ✓ Device registered successfully
[Twilio Call] ===== Joining Conference =====
[Twilio Call] ✓ Connection established
[Twilio Call] ✓ Call ACCEPTED
[Web UI] Device status changed: in-call
[Web UI] ✓ Joined in listen-only mode
```

---

## 常见场景

### 场景 1: 监听 AI Agent 与客服对话

**需求**: 观察 AI Agent 如何处理 IVR 流程

**方案**: 使用仅收听模式
- AI Agent 自动拨号、按键
- 操作员通过浏览器监听整个过程
- 不需要麦克风，不会干扰通话

### 场景 2: 无麦克风设备

**需求**: 笔记本麦克风损坏，但有耳机/扬声器

**方案**: 使用仅收听模式
- 可以听到 PSTN 被叫方的声音
- 被叫方听不到你的声音
- 适合单向信息获取

### 场景 3: 调试音频流

**需求**: 测试 PSTN → Conference → Web 的音频路径

**方案**: 使用仅收听模式
- 验证音频能否正确传输到浏览器
- 不需要双向音频
- 简化调试流程

---

## Mute 按钮在仅收听模式下的行为

| 模式 | Mute 按钮状态 | 点击效果 |
|------|--------------|---------|
| 正常模式 | ✅ 可用 | 切换麦克风静音/取消静音 |
| 仅收听模式 | ✅ 可用 | 无实际效果（因为本来就没音频发送） |

**注意**: 即使在仅收听模式下，Mute 按钮仍然可点击，但不会有实际效果。

---

## 如何切换到正常模式

如果想从"仅收听模式"切换到"正常模式"（需要说话）：

1. **Leave** - 离开 Conference
2. 在浏览器中**允许麦克风权限**
3. **Join Conference** - 重新加入

或者：

1. 刷新页面
2. 点击地址栏左侧图标 → 麦克风 → 允许
3. 重新执行 Call + Join Conference 流程

---

## 安全性说明

### 隐私保护

- ✅ 仅收听模式下，本地麦克风**完全不会被激活**
- ✅ 不会发送任何音频到 PSTN
- ✅ 被叫方无法听到你的环境音

### 权限最小化

- ✅ 遵循"权限最小化"原则
- ✅ 没有麦克风权限也能使用核心功能
- ✅ 用户体验更友好

---

## 故障排查

### Q: 仅收听模式下听不到声音

**可能原因**:
1. 系统音量/浏览器音量太低
2. 扬声器设备选择错误
3. PSTN 被叫方静音或未接听

**解决方法**:
1. 检查系统音量
2. 检查浏览器音频设置
3. 在 Console 查看 WebRTC 统计信息

### Q: 想切换到正常模式

**解决方法**:
1. Leave Conference
2. 允许麦克风权限
3. 重新 Join Conference

### Q: Mute 按钮在仅收听模式下有用吗

**回答**: 
- 按钮可点击，但无实际效果
- 因为没有音频流发送，静音与否没有区别

---

## 总结

✅ **支持无麦克风使用**  
✅ **自动降级到仅收听模式**  
✅ **清晰的 UI 提示**  
✅ **完整的日志记录**  

仅收听模式让系统更加灵活，适应更多使用场景！
