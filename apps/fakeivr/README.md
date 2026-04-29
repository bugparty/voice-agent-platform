# 使用说明
安装依赖：pnpm install
设置密钥：wrangler secret put TWILIO_AUTH_TOKEN
配置 KV（生产环境）：创建 KV namespace 并更新 wrangler.jsonc 中的 id
运行开发服务器：wrangler dev
在 Twilio Console 中设置 webhook URL 为你的 Worker URL
