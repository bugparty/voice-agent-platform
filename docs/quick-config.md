# 快速配置指南

## 设置拨叫号码

当前系统配置拨叫号码为：**+1 (619) 859-7172**

### 方法 1: 使用环境变量（推荐）

在 `apps/media-service` 目录下创建 `.env` 文件：

```bash
# 创建 .env 文件
cd apps/media-service
touch .env  # Windows 使用: type nul > .env
```

编辑 `.env` 文件，添加以下内容：

```bash
# Twilio 配置（必填）
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# 拨叫目标号码
FIXED_TO_NUMBER=+16198597172

# 公网 URL（用于 Twilio webhook，需要 ngrok）
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
```

### 方法 2: 直接修改代码（不推荐）

如果不想使用 .env 文件，可以直接修改 `apps/media-service/src/config/env.js`：

```javascript
function getConfig() {
  return {
    // ... 其他配置
    fixedToNumber: process.env.FIXED_TO_NUMBER || "+16198597172",  // 添加默认值
    // ...
  };
}
```

---

## 完整 .env 配置示例

```bash
# ============================================
# Twilio 基础配置（必需）
# ============================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890

# ============================================
# Phase 2: Conference 功能（可选）
# ============================================
# 如需 Web 端加入通话，需要配置以下三项
# TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_API_SECRET=your_api_secret_here
# TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# 拨叫配置
# ============================================
# 固定拨叫号码（点击 Call 时拨打的号码）
FIXED_TO_NUMBER=+16198597172

# ============================================
# 服务配置
# ============================================
# 公网 URL（Twilio webhook 会调用这个地址）
# 本地开发使用 ngrok: ngrok http 4001
# 然后填入 ngrok 给的 URL，例如：
PUBLIC_BASE_URL=https://abc123.ngrok.io

# 服务端口（默认 4001）
MEDIA_SERVICE_PORT=4001

# ============================================
# 音频 AI 配置（可选）
# ============================================
# 是否使用 Python VAD（false 则使用 mock）
USE_PYTHON_VAD=false

# Python ai-audio-service 地址
AI_AUDIO_GRPC_URL=localhost:50051
```

---

## 验证配置

启动服务后，查看日志：

```bash
pnpm --filter media-service start
```

应该看到：

```
[media-service] Starting call {
  to: '+16198597172',    ← 确认号码正确
  from: '+1234567890',
  sessionId: 'sess_...',
  confName: 'conf_...'
}
```

---

## 使用 ngrok 暴露本地服务

```bash
# 安装 ngrok（如果还没安装）
# https://ngrok.com/download

# 启动 ngrok
ngrok http 4001

# 复制 Forwarding URL，例如：
# Forwarding: https://abc123.ngrok.io -> http://localhost:4001

# 在 .env 中设置：
PUBLIC_BASE_URL=https://abc123.ngrok.io
```

**注意：** 每次重启 ngrok，URL 会变化，需要更新 `.env` 文件和 Twilio Console 的 TwiML App 配置。

---

## 测试流程

1. **配置 .env**
   ```bash
   cd apps/media-service
   # 编辑 .env 文件，填入配置
   ```

2. **启动 ngrok**（如果需要）
   ```bash
   ngrok http 4001
   # 复制 URL 到 .env 的 PUBLIC_BASE_URL
   ```

3. **启动服务**
   ```bash
   # Terminal 1: media-service
   pnpm --filter media-service start

   # Terminal 2: web UI
   pnpm --filter web dev
   ```

4. **测试拨叫**
   - 打开浏览器 http://localhost:3000
   - 点击 "Call" 按钮
   - 确认 +16198597172 手机收到来电

5. **测试 Conference**（Phase 2）
   - 通话接通后
   - 点击 "Join Conference"
   - 说话，确认对方能听到

---

## 常见问题

### Q: 如何修改拨叫号码？

**A:** 修改 `.env` 文件中的 `FIXED_TO_NUMBER`，重启 media-service。

### Q: 支持动态输入号码吗？

**A:** 当前版本是固定号码。如需动态输入，需要修改：
1. Web UI 添加输入框
2. `/call/start` API 接受 `to` 参数
3. 修改 `apps/media-service/src/index.js`

### Q: 号码格式要求？

**A:** 使用 E.164 格式：`+[国家代码][区号][号码]`
- 美国: `+16198597172`
- 中国: `+8613812345678`

### Q: .env 文件不生效？

**A:** 确保：
1. 文件名是 `.env`（没有扩展名）
2. 文件在 `apps/media-service/` 目录下
3. 重启了 media-service
4. 使用 `console.log(config.fixedToNumber)` 检查加载情况
