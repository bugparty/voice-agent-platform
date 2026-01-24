# Phase 2 配置指南

本文档说明如何配置 Twilio Console 并设置环境变量以启用 Conference 功能。

---

## 1. Twilio Console 配置

### 1.1 创建 TwiML App

1. 登录 [Twilio Console](https://console.twilio.com/)
2. 进入 **Voice → TwiML Apps**
3. 点击 **Create new TwiML App**
4. 填写表单：
   - **Friendly Name**: `voip-agent-web-join` (或任意名称)
   - **Voice Configuration - Request URL**: `https://YOUR_PUBLIC_BASE/twiml/webJoin`
   - **HTTP Method**: `POST`
5. 点击 **Save**
6. **记录 App SID**（格式：`APxxxx...`）

### 1.2 创建 API Key

1. 在 Twilio Console，进入 **Account → API Keys & Tokens**
2. 点击 **Create API Key**
3. 填写表单：
   - **Friendly Name**: `voip-agent-api-key` (或任意名称)
   - **Key Type**: 选择 **Standard**
4. 点击 **Create**
5. **立即复制并保存 Key SID 和 Secret**（Secret 只显示一次！）

---

## 2. 环境变量配置

### 2.1 media-service 环境变量

在 `apps/media-service/.env` 文件中添加以下变量：

```bash
# 已有变量（保持不变）
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
FIXED_TO_NUMBER=+0987654321
PUBLIC_BASE_URL=https://your-public-domain.com

# Phase 2 新增变量
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxx
```

**变量说明：**

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `TWILIO_API_KEY` | API Key SID | 从步骤 1.2 复制 |
| `TWILIO_API_SECRET` | API Secret | 从步骤 1.2 复制（只显示一次！） |
| `TWILIO_TWIML_APP_SID` | TwiML App SID | 从步骤 1.1 复制 |

### 2.2 web 环境变量

在 `apps/web/.env.local` 文件中添加：

```bash
NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:4001
```

如果使用生产环境，改为：

```bash
NEXT_PUBLIC_MEDIA_SERVICE_URL=https://your-media-service-domain.com
```

---

## 3. 安装依赖

### 3.1 media-service

```bash
cd apps/media-service
pnpm install
```

### 3.2 web

```bash
cd apps/web
pnpm install
```

这会安装 `@twilio/voice-sdk@^2.11.2`。

---

## 4. 启动服务

### 4.1 启动 media-service

```bash
cd apps/media-service
pnpm start
```

或使用 pnpm workspace：

```bash
pnpm --filter media-service start
```

### 4.2 启动 web UI

```bash
cd apps/web
pnpm dev
```

或使用 pnpm workspace：

```bash
pnpm --filter web dev
```

---

## 5. 验证流程

### 5.1 基础通话测试

1. 打开浏览器访问 `http://localhost:3000`
2. 点击 **Call** 按钮
3. 观察：
   - PSTN 被叫方手机应该响铃
   - UI 显示 `IN_CALL` 状态
   - Timeline 显示 `twilio.call.start` 事件
   - 显示 `sessionId` 和 `confName`

### 5.2 用户加入测试

1. 在通话状态下，点击 **Join Conference** 按钮
2. 浏览器会请求麦克风权限 → 点击 **允许**
3. 观察：
   - User 状态从 `DISCONNECTED` → `CONNECTING` → `IN-CALL`
   - **Join Conference** 按钮变灰
   - **Leave** 和 **Mute** 按钮激活
4. 对着麦克风说话 → PSTN 被叫方应该能听到你的声音
5. PSTN 被叫方说话 → 你应该能通过扬声器听到

### 5.3 静音测试

1. 在 `IN-CALL` 状态下，点击 **Mute** 按钮
2. Mic 状态显示 `MUTED`
3. 对着麦克风说话 → PSTN 被叫方听不到
4. 再次点击 **Mute** → 取消静音

### 5.4 离开测试

1. 点击 **Leave** 按钮
2. 用户从 conference 断开，但 PSTN 通话保持
3. User 状态变为 `CONNECTED`

### 5.5 挂断测试

1. 点击 **Hangup** 按钮
2. 整个通话结束
3. Call 状态变为 `DISCONNECTED`

---

## 6. 常见问题

### Q1: Token 生成失败，提示 "Token generation not configured"

**原因：** 环境变量未正确配置。

**解决：**
1. 检查 `.env` 文件是否包含所有三个新变量
2. 重启 media-service
3. 检查 console 是否有警告信息

### Q2: Join Conference 失败，提示 "Failed to connect"

**可能原因：**
1. **TwiML App URL 配置错误**
   - 检查 TwiML App 的 Voice URL 是否指向 `/twiml/webJoin`
   - URL 必须是公网可访问地址（使用 ngrok 时注意更新）

2. **麦克风权限被拒绝**
   - 浏览器会显示错误提示
   - 在浏览器设置中允许麦克风权限

### Q3: 用户听不到 PSTN 被叫方的声音

**原因：** 浏览器音频输出设备问题。

**解决：**
1. 检查浏览器音量
2. 检查系统音量
3. 在浏览器 DevTools Console 查看是否有音频播放错误

### Q4: PSTN 被叫方听不到用户声音

**可能原因：**
1. **静音状态** - 检查是否点击了 Mute
2. **麦克风设备** - 检查系统麦克风是否正常
3. **Conference 未正确建立** - 检查 media-service logs

### Q5: ngrok URL 变化后连接失败

**原因：** Twilio Console 的 TwiML App URL 仍指向旧地址。

**解决：**
1. 更新 TwiML App 的 Voice URL 为新的 ngrok URL
2. 更新 `.env` 中的 `PUBLIC_BASE_URL`
3. 重启 media-service

---

## 7. 调试技巧

### 7.1 查看浏览器 Console

打开 DevTools (F12)，查看：
- Twilio Device 连接日志
- 音频设备枚举信息
- 错误信息

### 7.2 查看 media-service 日志

观察以下关键日志：
- `[media-service] Token generated for ...` - Token 生成成功
- `[media-service] Web join TwiML requested` - Web leg 请求 TwiML
- `[Twilio Device] Registered` - Device 注册成功

### 7.3 Twilio Console Debugger

进入 **Monitor → Logs → Errors & Warnings** 查看：
- TwiML 执行错误
- Conference 创建/加入错误
- Media Stream 错误

---

## 8. 安全注意事项

1. **绝对不要** 将 `.env` 文件提交到 Git
2. **定期轮换** API Key 和 Secret
3. **生产环境** 使用 HTTPS（Twilio 要求）
4. **Token 有效期** 默认 1 小时，可在生成时调整

---

## 9. 下一步

Phase 2 完成后，可以考虑：
- 添加设备选择器（麦克风/扬声器切换）
- 实现 DTMF 键盘（用于 IVR 导航）
- 添加 AI TTS 输出到 PSTN
- 实现通话录音功能
