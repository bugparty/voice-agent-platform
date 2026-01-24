# Phase 2 变更日志

## 概述

Phase 2 实现了 Twilio Conference 集成和 Web 端用户语音接入功能，允许用户通过浏览器直接加入通话与 PSTN 被叫方对话。

---

## 主要变更

### 1. Node.js media-service 改造

#### 1.1 Session Store 扩展
**文件:** `apps/media-service/src/sessions/sessionStore.js`

**新增功能:**
- `sessionId` - 全局唯一会话标识符
- `confName` - Twilio Conference 名称
- `webCallSid` - Web leg 的 Call SID
- `state` - 会话状态机 (CALLING/IN_CALL/USER_JOINED/ENDING)
- `generateSessionId()` - 生成唯一 session ID
- `generateConfName()` - 根据 session ID 生成 conference 名称
- `getSessionByCallSid()` - 通过 Call SID 查询 session
- `getSessionBySessionId()` - 通过 Session ID 查询 session

**影响范围:**
- 所有 session 现在都有唯一的 `sessionId` 和 `confName`
- 支持通过多种方式查询 session

#### 1.2 TwiML 生成器重构
**文件:** `apps/media-service/src/twilio/twiml.js`

**新增函数:**
- `buildOutboundConferenceTwiml()` - 生成 PSTN leg 加入 conference 的 TwiML
  - 同时启用 Media Streams (用于 AI 监听)
  - 配置 conference 参数
- `buildWebJoinConferenceTwiml()` - 生成 Web leg 加入 conference 的 TwiML

**保留函数:**
- `buildTwiml()` - 向后兼容的 TwiML 生成器

#### 1.3 新增 API 端点
**文件:** `apps/media-service/src/index.js`

| 端点 | 方法 | 功能 |
|------|------|------|
| `/twiml/outbound` | POST | 返回 PSTN leg Conference TwiML |
| `/twiml/webJoin` | POST | 返回 Web leg Conference TwiML |
| `/token` | POST | 生成 Twilio Access Token |

**修改端点:**
- `/call/start` - 现在返回 `sessionId` 和 `confName`

#### 1.4 环境配置扩展
**文件:** `apps/media-service/src/config/env.js`

**新增环境变量:**
```
TWILIO_API_KEY          # Twilio API Key SID
TWILIO_API_SECRET       # Twilio API Secret
TWILIO_TWIML_APP_SID    # TwiML App SID
```

#### 1.5 事件系统扩展
**文件:** `apps/media-service/src/events/normalize.js`

**新增事件生成器:**
- `conferenceEvent()` - 生成 Conference 相关事件

**新增事件类型:**
- `conference.user.joined`
- `conference.user.left`
- `conference.user.muted`
- `conference.user.unmuted`

---

### 2. Web UI 实现

#### 2.1 Twilio Device 管理模块
**文件:** `apps/web/src/lib/twilio/device.ts` (新建)

**导出函数:**
- `initDevice(token, callbacks)` - 初始化 Twilio Device
- `joinConference(sessionId)` - 加入 conference
- `leaveConference()` - 离开 conference
- `toggleMute()` - 切换静音状态
- `isMuted()` - 获取当前静音状态
- `getDevice()` / `getActiveCall()` - 获取实例
- `destroyDevice()` - 清理资源

**类型定义:**
- `DeviceStatus` - 设备状态枚举
- `DeviceCallbacks` - 回调接口

#### 2.2 音频权限管理模块
**文件:** `apps/web/src/lib/permissions/audio.ts` (新建)

**导出函数:**
- `requestMicPermission()` - 请求麦克风权限
- `checkMicPermission()` - 检查权限状态
- `getAudioDevices()` - 获取音频设备列表
- `setAudioOutputDevice()` - 设置音频输出设备

**类型定义:**
- `PermissionState` - 权限状态枚举

#### 2.3 UI 组件更新
**文件:** `apps/web/src/app/page.tsx`

**新增状态:**
- `callState` - 通话状态 (包含 sessionId, confName)
- `userState` - 用户状态 (deviceStatus, micPermission, isMuted)
- `error` - 错误提示

**新增控件:**
- **Join Conference** 按钮 - 加入通话
- **Leave** 按钮 - 离开通话
- **Mute** 按钮 - 静音切换
- Session/Conference 信息显示
- 用户状态指示器
- 错误提示栏

**新增交互:**
- 自动请求麦克风权限
- Token 获取与 Device 初始化
- Conference 加入/离开流程
- 静音状态管理

#### 2.4 依赖更新
**文件:** `apps/web/package.json`

**新增依赖:**
```json
{
  "@twilio/voice-sdk": "^2.11.2"
}
```

---

## 架构变更总结

### 音频路径

#### 之前 (Phase 1)
```
PSTN → Media Streams → Node → Python AI
```

#### 现在 (Phase 2)
```
路径 A (监听): 
PSTN → Conference → Media Streams → Node → Python AI → VAD/ASR 事件

路径 B (用户说话):
Web 麦克风 → Twilio Voice SDK (WebRTC) → Conference → PSTN

路径 C (用户听):
PSTN → Conference → Twilio (WebRTC) → Web 扬声器
```

**关键特性:**
- Node.js **不经手** 用户音频流（降低延迟）
- 用户与 PSTN 直接在 Twilio Conference 中通话
- AI 继续通过 Media Streams 监听 PSTN 音频

---

## 向后兼容性

### 保留功能
- `/twiml` 端点 (legacy)
- `buildTwiml()` 函数
- 原有的 session 创建逻辑 (fallback)

### 不兼容变更
- 无破坏性变更
- 旧流程仍然可用

---

## 测试清单

- [x] PSTN 外呼成功
- [x] Media Streams 正常连接
- [x] VAD 事件正常推送
- [x] Web 端 Token 生成
- [x] Web 端 Device 初始化
- [x] 用户加入 conference
- [x] 用户与 PSTN 双向音频
- [x] 静音功能
- [x] 离开 conference
- [x] 挂断清理

---

## 已知限制

1. **本地 VAD 未实现** - 当前只监听 PSTN 音频，不监听用户麦克风
   - 如需监听用户，需要额外的 Media Stream 配置
2. **AI TTS 输出未实现** - Agent 暂时不能主动说话
   - 可通过 TwiML 重定向或双向 Media Streams 实现
3. **设备选择未实现** - 用户不能手动切换麦克风/扬声器
   - 需要在 UI 中添加设备选择器

---

## 文件清单

### 新建文件
```
apps/web/src/lib/twilio/device.ts
apps/web/src/lib/permissions/audio.ts
docs/phase2-plan.md
docs/phase2-setup.md
docs/phase2-changelog.md
```

### 修改文件
```
apps/media-service/src/sessions/sessionStore.js
apps/media-service/src/twilio/twiml.js
apps/media-service/src/config/env.js
apps/media-service/src/events/normalize.js
apps/media-service/src/index.js
apps/web/src/app/page.tsx
apps/web/package.json
```

---

## 配置清单

### Twilio Console
- [x] 创建 TwiML App
- [x] 配置 Voice URL 指向 `/twiml/webJoin`
- [x] 创建 API Key & Secret

### 环境变量
- [x] `TWILIO_API_KEY`
- [x] `TWILIO_API_SECRET`
- [x] `TWILIO_TWIML_APP_SID`

### 依赖安装
- [x] `@twilio/voice-sdk@^2.11.2`

---

## 下一步 (Phase 3 建议)

1. **AI TTS 输出** - 让 Agent 能够主动说话
2. **DTMF 键盘** - UI 发送 DTMF 用于 IVR 导航
3. **本地 VAD** - 监听用户麦克风，实现实时打断
4. **设备选择器** - 允许用户切换音频设备
5. **通话录音** - 记录完整通话内容
6. **Barge-in 优化** - 实现低延迟的语音打断
