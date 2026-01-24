## 技术栈声明

| 层级 | 选型 |
|------|------|
| 包管理 | pnpm workspaces |
| 前端框架 | Next.js 14+ (App Router) |
| 状态管理 | XState v5 |
| 后端运行时 | Node.js 18+ / Python 3.10+ |
| 通信协议 | gRPC (bidirectional streaming) |
| VAD 模型 | Silero VAD (ONNX) |

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## 推荐：Monorepo 顶层结构


```bash
repo/
  apps/
    web/                      # Next.js UI + BFF endpoints
    media-service/            # Node: Twilio Media Streams WS + gRPC client + call control
    ai-audio-service/         # Python: gRPC server + VAD(+ASR/分类预留)
  packages/
    proto/                    # .proto + 生成脚本 + 生成产物(可选)
    event-schema/             # TS/Zod 事件契约 + JSON schema + mock events
    shared-config/            # eslint/tsconfig/prettier(可选)
  infra/
    docker/                   # Dockerfiles
    compose/                  # docker-compose for local dev
    k8s/                      # 未来上 k8s 再用
  scripts/                    # 一键启动、生成、格式化
  docs/
    architecture/             # 你现在那份架构文档
    ui/                       # UI spec + screenshots
    runbooks/                 # 本地跑起来、排障
  .env.example
  README.md

```


---


## apps/web（Next.js：UI + 轻量 BFF）


**职责**：UI、token、TwiML webhook（如果你愿意把 Twilio webhooks 放这里也行）


```bash
apps/web/
  src/
    app/                      # App Router
      page.tsx                # Debug Console 页面
      api/
        token/route.ts        # Twilio Access Token
        twiml/route.ts        # 返回 TwiML (voice webhook)
        events/route.ts       # (可选) SSE/WebSocket gateway
    components/
      status/TopStatusBar.tsx
      panels/ControlPanel.tsx
      transcripts/LiveTranscripts.tsx
      timeline/EventTimeline.tsx
      input/CommandBar.tsx
    state/
      machines/
        callMachine.ts        # XState v5 通话状态机
        agentMachine.ts       # Agent 状态机
        vadMachine.ts         # VAD 状态机
      actors.ts               # XState actors
      store.ts                # 全局状态 store
    lib/
      twilio/                 # Device init、call helpers
      events/                 # event client, parsing, typing
      permissions/            # mic permissions + device selection
    types/
      ui.ts                   # UI state types (derived from event-schema)
  public/
  next.config.js

```


>
> 建议：UI 从一开始就“只吃事件”，所有状态由事件驱动（跟你 UI spec 一致）。
>
>
>


---


## apps/media-service（Node：Twilio WS + gRPC client + Twilio 控制）


**职责**：接 Twilio Media Streams（WS），把音频转发到 Python（gRPC streaming），接收 VAD/ASR/agent 事件，再控制 Twilio（redirect/play/stop等），并把统一事件推给 Web UI。


```bash
apps/media-service/
  src/
    index.ts                  # 启动入口
    config/
      env.ts
    twilio/
      mediaWsServer.ts        # 接 Twilio media stream WS
      twiml.ts                # TwiML 模板（listen/speak/transfer 等）
      callControl.ts          # Twilio REST API: redirect/hangup/play
      signatures.ts           # webhook 签名校验（可选）
    grpc/
      client.ts               # gRPC bidi client (to ai-audio-service)
      codecs.ts               # codec enum mapping, pass-through
    sessions/
      sessionStore.ts         # in-memory/redis store
      types.ts
    events/
      bus.ts                  # 内部事件总线
      emitters/
        uiWs.ts               # 推事件到 UI (WS/SSE)
        logs.ts               # 写文件/console
      normalize.ts            # 统一事件格式（对齐 event-schema）
    agent/
      controller.ts           # agent 状态机（如果 agent 不在 python）
  package.json

```


>
> 关键：`events/normalize.ts` 把各处来的东西（twilio/grpc/agent）都变成同一套 event-schema，再推给 UI。
>
> **事件命名转换规则**：
> - gRPC 层：`UPPER_SNAKE_CASE`（如 `SPEECH_START`）
> - UI 层：`category.source.action`（如 `vad.remote.start`）
> - 转换逻辑：`SPEECH_START` (source: remote) → `vad.remote.start`
>
>
>


---


## apps/ai-audio-service（Python：gRPC server + 音频AI）


**职责**：接收音频流，解码/重采样，Silero VAD 推理，输出 VAD 事件。后续自然扩展：ASR、beep/busy 分类、robot detector。


```bash
apps/ai-audio-service/
  ai_audio_service/
    __init__.py
    main.py                   # gRPC server entry
    config.py
    grpc/
      server.py               # gRPC bidi Stream handler
      generated/              # protoc 生成的 *_pb2.py
    audio/
      decode_mulaw.py         # μ-law -> PCM16
      resample.py             # 8k -> 16k
      framing.py              # 10/20ms framing
    vad/
      silero_vad.py           # Silero VAD ONNX runtime wrapper
      state_machine.py        # hysteresis + min speech/silence
      types.py
    pipeline/
      session_context.py      # per-session buffers/state
      metrics.py              # latency counters
    tests/
  pyproject.toml

```


>
> 建议：Python 只吐“音频AI事件”（VAD/ASR/分类）。至于 Twilio 控制/重定向，留在 Node。
>
>
>


---


## packages/proto（跨语言契约：gRPC）


**职责**：唯一真源（single source of truth）的 `.proto`，以及生成脚本（TS + Python）。


```bash
packages/proto/
  audioai/
    audioai.proto             # AudioChunk / VadEvent / (future AsrEvent)
  scripts/
    gen-ts.sh                 # 生成 TS 客户端/类型
    gen-py.sh                 # 生成 Python *_pb2.py
  generated/
    ts/                       # (可选) 生成产物提交到仓库
    py/

```


>
> 原型阶段可以把 generated 提交进仓库，省去每次环境搭建；后期再改成 build 时生成。
>
>
>


---


## packages/event-schema（UI/系统事件契约 + mock）


**职责**：你 UI spec 里那套事件名/字段，落成可验证的 schema（TS/Zod/JSON Schema），同时提供 mock events 让 UI 先跑起来。


```bash
packages/event-schema/
  src/
    events.ts                 # event union types
    zod.ts                    # zod schema for runtime validate
    constants.ts              # event names
    mock/
      sample-session.jsonl    # 一段完整通话事件流（json lines）
      generators.ts           # 生成 mock stream
  package.json

```


>
> 你要的“对方文本、我方文本、agent plan、vad 状态、用户指令、按钮操作”等，都最终以事件形式从这里统一定义。
>
>
>


---


## infra/compose（本地一键跑）


```bash
infra/compose/
  docker-compose.yml          # web + media-service + ai-audio-service + redis
infra/docker/
  web.Dockerfile
  media-service.Dockerfile
  ai-audio-service.Dockerfile

```


---


## docs（文档落点）


```bash
docs/
  architecture/
    vad-grpc-architecture.md
  ui/
    ui-spec.md
  runbooks/
    local-dev.md
    twilio-setup.md
    troubleshooting.md

```


---


## 一句话：模块边界怎么定


- **web**：只负责 UI + 少量 BFF（token/twiml）
- **media-service**：所有“实时系统 glue”与“通话控制”都在这里（Twilio WS、gRPC client、redirect、推 UI 事件）
- **ai-audio-service**：所有音频 AI（VAD/ASR/分类）都在这里
- **proto + event-schema**：两份契约把系统“钉死”，防止后期耦合爆炸


---
 