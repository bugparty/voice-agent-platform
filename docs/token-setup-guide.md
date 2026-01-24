# Twilio Access Token 配置指南

## 问题

如果你看到这个错误：
```
AccessTokenInvalid (20101): Twilio was unable to validate your Access Token
```

说明 Web 端 token 配置不正确。

---

## 解决方案：配置环境变量

Token 由 **media-service** 后端生成，需要配置 3 个 Twilio 凭证。

### 步骤 1: 创建 API Key（在 Twilio Console）

1. 登录 [Twilio Console](https://console.twilio.com/)
2. 进入 **Account → API Keys & Tokens**
3. 点击 **Create API Key** 按钮
4. 填写表单：
   - **Friendly Name**: `voip-agent-api-key`（或任意名称）
   - **Key Type**: 选择 **Standard**
5. 点击 **Create**
6. ⚠️ **立即复制并保存**：
   - **Key SID**: `SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Secret**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`（**只显示一次！**）

### 步骤 2: 创建 TwiML App（在 Twilio Console）

1. 在 Twilio Console，进入 **Voice → TwiML Apps**
2. 点击 **Create new TwiML App**
3. 填写表单：
   - **Friendly Name**: `voip-agent-web-join`
   - **Voice Configuration - Request URL**: `https://YOUR_PUBLIC_BASE/twiml/webJoin`
     - ⚠️ **重要**: 这个 URL 必须是**公网可访问的**（不能是 localhost）
     - 如果使用 ngrok: `https://xxxx.ngrok.io/twiml/webJoin`
     - 这个 URL 必须与 `PUBLIC_BASE_URL` 环境变量一致
   - **HTTP Method**: `POST`
4. 点击 **Save**
5. 复制 **App SID**: `APxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> 💡 **调试提示**: 当 Web 端加入 Conference 时，Twilio 会向这个 URL 发送 POST 请求。
> 如果 media-service 日志中没有看到 `/twiml/webJoin` 请求，说明 TwiML App 配置有问题。

### 步骤 3: 配置环境变量

在 `apps/media-service` 目录下创建或编辑 `.env` 文件：

```bash
# ============================================
# Twilio 基础配置（必需）
# ============================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# ============================================
# Phase 2: Web Join Token 配置（必需！）
# ============================================
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here_only_shown_once
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# 其他配置
# ============================================
FIXED_TO_NUMBER=+16198597172
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
```

### 步骤 4: 重启 media-service

```bash
# Ctrl+C 停止服务
# 然后重新启动
pnpm --filter media-service start
```

---

## 验证配置

### 方法 1: 启动时检查日志

启动 media-service 后，应该**不会**看到警告：

```
# ✅ 正确配置 - 没有警告

# ❌ 配置缺失 - 会看到：
[media-service] Twilio API credentials not configured for token generation
```

### 方法 2: 测试 token 端点

使用 curl 或 Postman 测试：

```bash
curl -X POST http://localhost:4001/token \
  -H "Content-Type: application/json" \
  -d '{"identity": "test_user", "sessionId": "test_session"}'
```

**正确响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "identity": "test_user",
  "sessionId": "test_session"
}
```

**错误响应（配置缺失）：**
```json
{
  "error": "Token generation not configured. Please set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID"
}
```

### 方法 3: Web 端测试

1. 点击 **Call** 按钮（PSTN 通话）
2. 点击 **Join Conference** 按钮
3. 查看浏览器 Console：

**成功：**
```
[Web UI] Step 3: Requesting token from backend...
[Web UI] Token response received { hasToken: true, hasError: false }
[Twilio Device] ✓ Device registered successfully
```

**失败：**
```
[Web UI] Token response received { hasToken: false, hasError: true }
[Web UI] Token error: Token generation not configured...
```

---

## 完整的 .env 文件模板

```bash
# ============================================
# Twilio 账号信息（从 Console 获取）
# ============================================
# Account SID: https://console.twilio.com/
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Auth Token: https://console.twilio.com/
TWILIO_AUTH_TOKEN=your_auth_token_here

# 你的 Twilio 号码
TWILIO_FROM_NUMBER=+1234567890

# ============================================
# Phase 2: Web Join 配置
# ============================================
# 创建方法：Account → API Keys & Tokens → Create API Key
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_secret_only_shown_once

# 创建方法：Voice → TwiML Apps → Create new TwiML App
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# 通话配置
# ============================================
# 固定拨叫号码
FIXED_TO_NUMBER=+16198597172

# 公网 URL（使用 ngrok）
PUBLIC_BASE_URL=https://abc123.ngrok.io

# ============================================
# 可选配置
# ============================================
MEDIA_SERVICE_PORT=4001
USE_PYTHON_VAD=false
AI_AUDIO_GRPC_URL=localhost:50051
```

---

## 常见问题

### Q1: API Key 和 Auth Token 有什么区别？

**Auth Token:**
- 账号级别的主凭证
- 用于调用 Twilio REST API（发起呼叫、挂断等）
- 在 `.env` 中设置为 `TWILIO_AUTH_TOKEN`

**API Key:**
- 用于生成 Access Token
- Access Token 由客户端（Web/Mobile）使用
- 在 `.env` 中设置为 `TWILIO_API_KEY` 和 `TWILIO_API_SECRET`

### Q2: 为什么需要 TwiML App？

TwiML App 定义了 Web 端连接时的行为：
- Web 端调用 `device.connect()` 时
- Twilio 会请求 TwiML App 配置的 URL (`/twiml/webJoin`)
- 你的服务返回 TwiML 指示如何处理这个连接（加入 Conference）

### Q3: API Secret 忘记了怎么办？

API Secret **只在创建时显示一次**，无法再次查看。

**解决方法：**
1. 删除旧的 API Key
2. 创建新的 API Key
3. 更新 `.env` 中的 `TWILIO_API_KEY` 和 `TWILIO_API_SECRET`
4. 重启 media-service

### Q4: 可以用 Account SID 和 Auth Token 生成 token 吗？

**不推荐**，因为：
- Auth Token 权限过高（可以操作整个账号）
- 如果泄露到客户端会有安全风险
- 最佳实践是使用 API Key（权限更细粒度）

### Q5: ngrok URL 变化后需要更新什么？

每次重启 ngrok，URL 会变化，需要更新：

1. `.env` 中的 `PUBLIC_BASE_URL`
2. Twilio Console → TwiML App → Voice URL
3. 重启 media-service

---

## 安全建议

1. ✅ **不要提交 `.env` 文件到 Git**
   - 已在 `.gitignore` 中配置

2. ✅ **定期轮换 API Key**
   - 每 90 天更换一次

3. ✅ **使用环境变量**
   - 不要硬编码在代码中

4. ✅ **生产环境使用 HTTPS**
   - Twilio 要求 webhook URL 必须是 HTTPS

---

## 故障排查步骤

### 1. 检查环境变量是否加载

在 `apps/media-service/src/index.js` 中临时添加：

```javascript
console.log('[DEBUG] Config loaded:', {
  hasApiKey: !!config.twilioApiKey,
  hasApiSecret: !!config.twilioApiSecret,
  hasTwimlAppSid: !!config.twilioTwimlAppSid
});
```

应该输出：
```
[DEBUG] Config loaded: { hasApiKey: true, hasApiSecret: true, hasTwimlAppSid: true }
```

### 2. 检查 token 生成

在 `/token` 端点中添加日志：

```javascript
console.log('[DEBUG] Token params:', {
  accountSid: config.twilioAccountSid,
  apiKey: config.twilioApiKey,
  apiSecretLength: config.twilioApiSecret?.length,
  twimlAppSid: config.twilioTwimlAppSid
});
```

### 3. 验证 TwiML App URL

确保 TwiML App 的 Voice URL 指向正确的地址：
```
https://your-ngrok-url.ngrok.io/twiml/webJoin
```

可以手动访问测试：
```bash
curl -X POST https://your-ngrok-url.ngrok.io/twiml/webJoin \
  -d "sessionId=test_session"
```

应该返回 TwiML XML。

---

## 参考文档

- [Twilio Access Token](https://www.twilio.com/docs/iam/access-tokens)
- [API Keys](https://www.twilio.com/docs/iam/keys/api-key)
- [TwiML Apps](https://www.twilio.com/docs/voice/twiml/applications)
- [Phase 2 Setup](./phase2-setup.md)
