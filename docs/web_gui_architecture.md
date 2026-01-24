# Call Assistant Debug Console UI Specification

> Purpose: A **single-page control & observability console** for a Web-based VoIP call assistant. The UI is designed to support **real-time calls**, **VAD/ASR visibility**, **agent reasoning transparency**, and **operator control** during development and debugging — while remaining a viable foundation for a production UI.

---

## 0. 状态管理：XState v5

### 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 状态管理 | XState v5 | 状态机建模适合通话场景、事件驱动、可视化调试 |

### 核心状态机设计

#### callMachine - 通话状态机

```typescript
import { setup, assign } from 'xstate';

export const callMachine = setup({
  types: {
    context: {} as {
      callSid: string | null;
      direction: 'INBOUND' | 'OUTBOUND' | null;
      startTime: number | null;
    },
    events: {} as
      | { type: 'DIAL' }
      | { type: 'INCOMING' }
      | { type: 'CONNECTED'; callSid: string }
      | { type: 'HOLD' }
      | { type: 'RESUME' }
      | { type: 'HANGUP' }
      | { type: 'ERROR'; error: string }
  }
}).createMachine({
  id: 'call',
  initial: 'disconnected',
  context: { callSid: null, direction: null, startTime: null },
  states: {
    disconnected: {
      on: {
        DIAL: { target: 'connecting', actions: assign({ direction: 'OUTBOUND' }) },
        INCOMING: { target: 'connecting', actions: assign({ direction: 'INBOUND' }) }
      }
    },
    connecting: {
      on: {
        CONNECTED: {
          target: 'inCall',
          actions: assign({ callSid: ({ event }) => event.callSid, startTime: Date.now })
        },
        ERROR: 'disconnected',
        HANGUP: 'ending'
      }
    },
    inCall: {
      on: {
        HOLD: 'hold',
        HANGUP: 'ending'
      }
    },
    hold: {
      on: {
        RESUME: 'inCall',
        HANGUP: 'ending'
      }
    },
    ending: {
      after: { 1000: 'disconnected' }
    }
  }
});
```

#### agentMachine - Agent 状态机

```typescript
export const agentMachine = setup({
  types: {
    context: {} as {
      plan: string | null;
      speakingText: string | null;
    },
    events: {} as
      | { type: 'START' }
      | { type: 'PAUSE' }
      | { type: 'SPEECH_DETECTED' }
      | { type: 'THINKING_DONE'; plan: string }
      | { type: 'SPEAK'; text: string }
      | { type: 'SPEAK_DONE' }
      | { type: 'BARGE_IN' }
  }
}).createMachine({
  id: 'agent',
  initial: 'paused',
  context: { plan: null, speakingText: null },
  states: {
    paused: {
      on: { START: 'listening' }
    },
    listening: {
      on: {
        SPEECH_DETECTED: 'thinking',
        PAUSE: 'paused'
      }
    },
    thinking: {
      on: {
        THINKING_DONE: {
          target: 'speaking',
          actions: assign({ plan: ({ event }) => event.plan })
        },
        PAUSE: 'paused'
      }
    },
    speaking: {
      on: {
        SPEAK_DONE: 'listening',
        BARGE_IN: 'listening',
        PAUSE: 'paused'
      }
    }
  }
});
```

#### vadMachine - VAD 状态机

```typescript
export const vadMachine = setup({
  types: {
    context: {} as { prob: number; source: 'remote' | 'local' },
    events: {} as
      | { type: 'SPEECH_START'; prob: number }
      | { type: 'SPEECH_UPDATE'; prob: number }
      | { type: 'SPEECH_END' }
  }
}).createMachine({
  id: 'vad',
  initial: 'silent',
  context: { prob: 0, source: 'remote' },
  states: {
    silent: {
      on: {
        SPEECH_START: {
          target: 'speaking',
          actions: assign({ prob: ({ event }) => event.prob })
        }
      }
    },
    speaking: {
      on: {
        SPEECH_UPDATE: { actions: assign({ prob: ({ event }) => event.prob }) },
        SPEECH_END: { target: 'silent', actions: assign({ prob: 0 }) }
      }
    }
  }
});
```

### 状态机组合与 Actor 模式

```typescript
// state/actors.ts
import { createActor } from 'xstate';
import { callMachine, agentMachine, vadMachine } from './machines';

export const callActor = createActor(callMachine);
export const agentActor = createActor(agentMachine);
export const vadRemoteActor = createActor(vadMachine);
export const vadLocalActor = createActor(vadMachine);

// 启动所有 actors
callActor.start();
agentActor.start();
vadRemoteActor.start();
vadLocalActor.start();
```

### 与 React 集成

```typescript
// 使用 @xstate/react
import { useSelector } from '@xstate/react';
import { callActor, agentActor } from './actors';

function TopStatusBar() {
  const callState = useSelector(callActor, state => state.value);
  const agentPhase = useSelector(agentActor, state => state.value);
  
  return (
    <div>
      <span>Call: {callState}</span>
      <span>Agent: {agentPhase}</span>
    </div>
  );
}
```

---

## 1. Design Goals

* Real-time visibility into **call state**, **audio activity (VAD)**, and **agent progress**
* Clear separation between:

  * Remote speaker (callee)
  * Local microphone (operator)
  * Agent (AI assistant)
* Event-driven UI: all state changes arrive as **typed events**
* Debuggable: every decision is inspectable in a timeline
* Low cognitive load: users can understand “who is talking” and “what the agent is doing” in <2 seconds

---

## 2. Page Layout Overview

```
┌────────────────────────────────────────────────────────────┐
│ Top Status Bar                                             │
├───────────────┬───────────────────────────────┬────────────┤
│ Control Panel │ Live Conversation & Transcripts│ Timeline   │
│ (Left)        │ (Center)                       │ (Right)    │
├───────────────┴───────────────────────────────┴────────────┤
│ Command / Input Bar (Bottom)                               │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Top Status Bar

### Purpose

Instant, glanceable system state: call, audio, agent, and pipeline health.

### Fields

| Field          | Type   | Description                                                         |
| -------------- | ------ | ------------------------------------------------------------------- |
| callStatus     | enum   | `DISCONNECTED / CONNECTING / IN_CALL / HOLD / ENDING`               |
| callDirection  | enum   | `INBOUND / OUTBOUND`                                                |
| callSid        | string | Twilio Call SID (shortened)                                         |
| vadRemote      | enum   | `SILENT / SPEAKING`                                                 |
| vadRemoteProb  | number | 0.0 – 1.0                                                           |
| vadLocal       | enum   | `SILENT / SPEAKING`                                                 |
| agentPhase     | enum   | `LISTENING / THINKING / SPEAKING / WAITING / TRANSFERRING / PAUSED` |
| pipelineStatus | object | `{ media, grpc, asr, tts }` booleans                                |

### UI Behavior

* VAD = SPEAKING → pulsating indicator
* AgentPhase = THINKING → spinner + latency counter
* Any pipeline failure → red badge

### Mock Data

```json
{
  "callStatus": "IN_CALL",
  "callDirection": "INBOUND",
  "callSid": "CA1234...",
  "vadRemote": "SPEAKING",
  "vadRemoteProb": 0.82,
  "vadLocal": "SILENT",
  "agentPhase": "LISTENING",
  "pipelineStatus": {
    "media": true,
    "grpc": true,
    "asr": true,
    "tts": true
  }
}
```

---

## 4. Control Panel (Left)

### Purpose

Manual call control, permissions, and debug overrides.

### Sections

#### 4.1 Call Controls

| Action        | Description                |
| ------------- | -------------------------- |
| Call / Hangup | Start or end call          |
| Mute Mic      | Mute local microphone      |
| Hold / Resume | Hold call                  |
| Transfer      | Transfer to human operator |

#### 4.2 Agent Controls

| Action              | Description                     |
| ------------------- | ------------------------------- |
| Start Agent         | Enable agent decision loop      |
| Pause Agent         | Stop autonomous decisions       |
| Force Stop Playback | Immediate barge-in              |
| Replay Last TTS     | Replay most recent agent speech |

#### 4.3 Permissions

| Field         | Type   | Description                 |
| ------------- | ------ | --------------------------- |
| micPermission | enum   | `GRANTED / PROMPT / DENIED` |
| inputDevice   | string | Selected microphone         |
| outputDevice  | string | Selected speaker            |

### Mock Data

```json
{
  "micPermission": "GRANTED",
  "inputDevice": "Built-in Mic",
  "outputDevice": "Default Speaker"
}
```

---

## 5. Live Conversation & Transcripts (Center)

### Purpose

Show **who is speaking right now**, what has been said, and what the agent is about to say.

---

### 5.1 Remote Speaker (Callee)

#### Fields

| Field        | Type   | Description              |
| ------------ | ------ | ------------------------ |
| partialText  | string | Live ASR partial         |
| finalText    | string | Last finalized utterance |
| lastUpdateTs | number | ms since call start      |

#### Behavior

* Partial text updates in-place (italic / light color)
* Finalized text appended to history

#### Mock

```json
{
  "partialText": "uh I think the address is...",
  "finalText": "The address is 123 Market Street",
  "lastUpdateTs": 18420
}
```

---

### 5.2 Local Microphone (Operator)

Same structure as Remote Speaker, but labeled **Local Mic**.

---

### 5.3 Agent Output

#### Fields

| Field           | Type   | Description                 |
| --------------- | ------ | --------------------------- |
| plan            | string | Current agent plan / intent |
| speakingPartial | string | TTS text being spoken       |
| speakingFinal   | string | Final spoken text           |

#### Behavior

* Plan displayed as a collapsible card
* SpeakingPartial updates live

#### Mock

```json
{
  "plan": "Confirm shipping address and delivery window",
  "speakingPartial": "Thanks, let me repeat that address...",
  "speakingFinal": "Thanks. I have the address as 123 Market Street. Is that correct?"
}
```

---

## 6. Timeline / Event Log (Right)

### Purpose

Complete chronological trace of **everything that happened**.

### Event Model

| Field    | Type   | Description                                       |
| -------- | ------ | ------------------------------------------------- |
| id       | string | UUID                                              |
| ts       | number | ms since call start                               |
| category | enum   | `VAD / ASR / AGENT / TTS / TWILIO / USER / ERROR` |
| level    | enum   | `INFO / WARN / ERROR`                             |
| payload  | object | Category-specific data                            |

### Filters

* Toggle by category
* Search by text

### Mock Event

```json
{
  "id": "evt-1023",
  "ts": 18300,
  "category": "VAD",
  "level": "INFO",
  "payload": {
    "source": "remote",
    "event": "vad.remote.start",
    "prob": 0.81
  }
}
```

**注意**：Timeline 显示的事件使用统一的 UI 事件格式（`category.source.action`），由 `media-service` 的事件规范化层统一转换。

---

## 7. Utterance History

### Remote Utterances

| Field           | Description    |
| --------------- | -------------- |
| id              | Utterance ID   |
| text            | Final ASR text |
| tsStart / tsEnd | Timing         |
| confidence      | ASR confidence |

### Agent Utterances

| Field | Description    |
| ----- | -------------- |
| id    | Utterance ID   |
| text  | Spoken text    |
| kind  | `TTS / SYSTEM` |

---

## 8. Command / Input Bar (Bottom)

### Purpose

Direct operator input to the agent or system.

### Fields

| Field     | Description     |
| --------- | --------------- |
| inputText | Multiline text  |
| mode      | `USER / SYSTEM` |
| send      | Submit          |

### Supported Slash Commands

* `/hangup`
* `/transfer`
* `/bargein`
* `/replay`
* `/set vad.start 0.6`

### Mock

```json
{
  "inputText": "Ask them to confirm the ZIP code",
  "mode": "USER"
}
```

---

## 9. Event Types (Contract)

All realtime updates are delivered as events:

* `vad.remote.start / end / update`
* `vad.local.start / end / update`
* `asr.remote.partial / final`
* `asr.local.partial / final`
* `agent.phase`
* `agent.plan`
* `agent.speak.partial / final`
* `twilio.call.status`
* `error.*`

---

## 10. Notes

* This UI is intentionally **developer-first** but not throwaway
* Every field maps directly to backend events
* No polling — everything is push-based
* **状态管理使用 XState v5**：所有 UI 状态由状态机驱动，支持可视化调试（[Stately Studio](https://stately.ai/studio)）

---

> This document is the **contract between backend events and frontend state**. If the backend emits clean events, the UI becomes trivial and robust.
