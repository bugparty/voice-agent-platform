from __future__ import annotations

from typing import Any, Callable, Dict, Optional
import json
import logging
import uuid
import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)

ToolFn = Callable[[Dict[str, Any]], Any]

TOOLS: Dict[str, Dict[str, Any]] = {}
_grpc_client: Optional[Any] = None

def register_tool(name: str, schema: Dict[str, Any], fn: ToolFn):
    TOOLS[name] = {"schema": schema, "fn": fn}

# gRPC client injection for tool actions
def set_grpc_client(client: Any) -> None:
    global _grpc_client
    _grpc_client = client

def type_dtmf(args):
    digit = args.get("digit", "1")
    digit = str(digit)

    action = None
    try:
        from agent_service.proto import agent_pb2

        action = agent_pb2.AgentAction(
            action_id=f"dtmf-{uuid.uuid4().hex[:8]}",
            send_dtmf=agent_pb2.SendDTMF(digits=digit),
        )
    except Exception as exc:
        logger.warning("DTMF action build failed: %s", exc)

    if _grpc_client is None:
        logger.warning("gRPC client not set; DTMF not sent")
    elif action is not None:
        try:
            _grpc_client.send_suggestion(
                suggestion_id=f"dtmf-{uuid.uuid4().hex[:8]}",
                plan=f"Send DTMF digits: {digit}",
                actions=[action],
                confidence=0.9,
            )
        except Exception as exc:
            logger.error("Failed to send DTMF: %s", exc)

    return {"ok": True, "digit": digit}

def speak_to_user(args):
    text = args["text"]
    action = None
    try:
        from agent_service.proto import agent_pb2

        action = agent_pb2.AgentAction(
            action_id=f"say-{uuid.uuid4().hex[:8]}",
            copilot_hint=agent_pb2.CopilotHint(text=text),
        )
    except Exception as exc:
        logger.warning("Speak action build failed: %s", exc)

    if _grpc_client is None:
        logger.warning("gRPC client not set; message not sent")
    elif action is not None:
        try:
            _grpc_client.send_suggestion(
                suggestion_id=f"say-{uuid.uuid4().hex[:8]}",
                plan="Send agent message to web UI",
                actions=[action],
                confidence=0.9,
            )
        except Exception as exc:
            logger.error("Failed to send agent message: %s", exc)

    return {"ok": True, "said": text[:80]}
class SessionState:
    # 生命周期
    phase: str               # welcome | menu | verify | transfer | end
    call_active: bool

    # 时间相关
    last_event_ts: int
    silence_ms: int

    # 语音/打断
    user_speaking: bool
    can_barge_in: bool

    # 重试 / 错误
    retry_count: int

    # 允许的行为（硬规则）
    can_transfer: bool

register_tool(
    "type_dtmf",
    schema={
        "type": "object",
        "properties": {"digit": {"type": "string"}},
        "required": ["digit"]
    },
    fn=type_dtmf
)

register_tool(
    "speak_to_user",
    schema={
        "type": "object",
        "properties": {"text": {"type": "string"}},
        "required": ["text"]
    },
    fn=speak_to_user
)
def build_tools_payload():
    tools = []
    for name, t in TOOLS.items():
        tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": f"Tool: {name}",
                "parameters": t["schema"]
            }
        })
    return tools
def run_agent_loop(client, model: str, messages: list, max_steps: int = 6):
    """
    client: 你的 OpenAI client（或兼容接口）
    messages: chat messages（含 system/user/assistant/tool）
    返回：final assistant content + 过程中的 tool 调用记录
    """
    tools_payload = build_tools_payload()
    tool_trace = []

    for step in range(max_steps):
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools_payload,
            tool_choice="auto",
        )

        msg = resp.choices[0].message

        # 1) 有 tool calls：执行每个 tool
        tool_calls = getattr(msg, "tool_calls", None)
        if tool_calls:
            # 先把 assistant 的 tool_call 消息记入上下文
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": tc.type,
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        }
                    } for tc in tool_calls
                ]
            })

            for tc in tool_calls:
                name = tc.function.name
                raw_args = tc.function.arguments

                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception as e:
                    result = {"ok": False, "error": f"bad_json_args: {e}", "raw": raw_args}
                else:
                    # 执行工具
                    if name not in TOOLS:
                        result = {"ok": False, "error": f"unknown_tool: {name}"}
                    else:
                        try:
                            result = TOOLS[name]["fn"](args)
                        except Exception as e:
                            result = {"ok": False, "error": f"tool_exception: {e}"}

                tool_trace.append({"tool": name, "args": raw_args, "result": result})

                # 把 tool result 作为 role=tool 追加回 messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })

            # 回到 loop 让模型根据 tool 结果继续推理
            continue

        # 2) 没有 tool call：认为是最终答复
        final_text = msg.content or ""
        messages.append({"role": "assistant", "content": final_text})
        return final_text, tool_trace

    # 超出 max_steps：兜底
    return "I’m sorry—I'm having trouble completing that request right now.", tool_trace

def decide_for_asr_final(client, session_state, text: str, model: str = None):
    """
    根据 ASR final 文本做出决策
    
    Args:
        client: OpenAI client
        session_state: SessionState 对象
        text: ASR final 文本
        model: 使用的模型名称（可选，默认从环境变量 OPENAI_MODEL 读取）
    """
    import os
    if model is None:
        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    
    system = {
        "role": "system",
        "content": (
            "You are a phone-call  agent for calling a pharmacy  asking about a prescription and transferring the call to a human. "
            "the phone system will often ordered like the last option will tend to transfer the call to a human."
            "Respond with tool calls when you need actions. "
            "Prefer type_dtmf when you need to type a key on the phone."
            "Prefer speak_to_user when you need to speak to the user or you reach a human agent."
        )
    }

    context = {
        "role": "system",
        "content": json.dumps({
            "phase": session_state.phase,
            "retry": session_state.retry_count,
            "can_transfer": session_state.can_transfer,
            "slots": session_state.slots,
            "last_tool": session_state.last_tool,
        }, ensure_ascii=False)
    }

    # history（只保留 final turns）
    # 将 "menu" role 映射为 "assistant"（IVR 菜单是系统播放的语音）
    def map_role(role: str) -> str:
        if role == "menu":
            return "assistant"
        return role
    history_msgs = [{"role": map_role(t.role), "content": t.text} for t in session_state.history]

    user = {"role": "user", "content": text}

    messages = [system, context, *history_msgs, user]

    final_text, trace = run_agent_loop(client, model=model, messages=messages)
    return final_text, trace

class Phase(Enum):
    BOOTSTRAP = auto()
    COLLECT_MENU = auto()     # 收集一段菜单 ASR
    DECIDING = auto()         # vad stop 后触发 agent；期间仍继续收下一段
    CONNECTED = auto()
    ENDED = auto()


@dataclass
class Turn:
    role: str      # "system" | "user" | "assistant" | "menu" (menu 会在 API 调用时映射为 assistant)
    text: str
    ts_ms: int


@dataclass
class SessionState:
    session_id: str

    # 生命周期/阶段
    phase: str = "welcome"        # 你 decide_for_asr_final 用字符串，这里保持字符串
    call_active: bool = True

    # 时间相关
    last_event_ts: int = 0
    silence_ms: int = 0

    # 语音/打断
    user_speaking: bool = False
    can_barge_in: bool = True

    # 重试/错误
    retry_count: int = 0

    # 允许行为
    can_transfer: bool = True      # 你后面如果要 verify gate，可以改这里

    # 结构化记忆（对齐 decide_for_asr_final）
    slots: Dict[str, Any] = field(default_factory=dict)
    last_tool: Optional[Dict[str, Any]] = None
    history: Deque[Turn] = field(default_factory=lambda: deque(maxlen=20))

    # --- 菜单段收集缓冲 ---
    menu_buf: List[str] = field(default_factory=list)      # 当前段
    next_buf: List[str] = field(default_factory=list)      # DECIDING 时收到的下一段

    segment_idx: int = 0
    deciding_task: Optional[asyncio.Task] = None
    deciding_segment: Optional[int] = None

    # 用于你的“模拟药房固定流程”提示（可选）
    step_idx: int = 0   # 0=第一层，1=第二层，2=药剂编码


# ----------------------------
# 2) FSM：只负责“什么时候触发 agent”，不负责直接按键
# ----------------------------

class CallFSM:
    """
    输入：call/vad/asr events
    
    职责：
    - 收集 ASR final 事件的文本到 buffer
    - 当 VAD stop (end) 事件到来时，合并 buffer 并调用 decide_for_asr_final
    - 管理 session 状态和生命周期
    """

    def __init__(self, *, llm_client, decide_for_asr_final_fn):
        self.llm_client = llm_client
        self.decide_for_asr_final = decide_for_asr_final_fn
        self.sessions: Dict[str, SessionState] = {}
        self._lock: Optional[asyncio.Lock] = None  # Lazily initialized

    def _get_lock(self) -> asyncio.Lock:
        """
        Lazily initialize the asyncio.Lock.
        
        asyncio.Lock() requires an event loop at creation time (Python 3.10+).
        We defer creation until first use within an async context.
        """
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def get_or_create_session(self, session_id: str) -> SessionState:
        """获取或创建 session 状态"""
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionState(session_id=session_id)
            logger.info(f"[CallFSM] Created new session: {session_id}")
        return self.sessions[session_id]

    def remove_session(self, session_id: str) -> None:
        """移除 session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"[CallFSM] Removed session: {session_id}")

    async def handle_asr_event(
        self,
        session_id: str,
        text: str,
        is_final: bool,
        confidence: float,
        timestamp_ms: int,
        track: str = "remote"
    ) -> None:
        """
        处理 ASR 事件
        
        - 只收集 final 事件
        - 文本添加到 menu_buf（如果正在 DECIDING，则添加到 next_buf）
        """
        if not is_final:
            # 忽略 partial 事件
            return

        if not text or not text.strip():
            return

        async with self._get_lock():
            session = self.get_or_create_session(session_id)
            session.last_event_ts = timestamp_ms

            # 如果正在 DECIDING 阶段，收集到 next_buf 供下一轮使用
            if session.deciding_task is not None and not session.deciding_task.done():
                session.next_buf.append(text.strip())
                logger.debug(
                    f"[CallFSM] ASR final (to next_buf): session={session_id}, "
                    f"text='{text[:50]}...', next_buf_len={len(session.next_buf)}"
                )
            else:
                # 正常收集到 menu_buf
                session.menu_buf.append(text.strip())
                logger.debug(
                    f"[CallFSM] ASR final (to menu_buf): session={session_id}, "
                    f"text='{text[:50]}...', menu_buf_len={len(session.menu_buf)}"
                )

    async def handle_vad_event(
        self,
        session_id: str,
        action: str,
        prob: float,
        track: str,
        music_prob: float,
        timestamp_ms: int
    ) -> Optional[Tuple[str, list]]:
        """
        处理 VAD 事件
        
        - action="start": 标记 user_speaking=True
        - action="end": 合并 menu_buf，触发 decide_for_asr_final
        
        返回: (final_text, tool_trace) 如果触发了决策，否则 None
        """
        # 用于在锁外等待的变量
        task: Optional[asyncio.Task] = None
        session: Optional[SessionState] = None
        
        async with self._get_lock():
            session = self.get_or_create_session(session_id)
            session.last_event_ts = timestamp_ms

            if action == "start":
                session.user_speaking = True
                logger.debug(f"[CallFSM] VAD start: session={session_id}, track={track}")
                return None

            elif action == "end":
                session.user_speaking = False
                logger.debug(
                    f"[CallFSM] VAD end: session={session_id}, track={track}, "
                    f"menu_buf_len={len(session.menu_buf)}"
                )

                # 检查是否有收集到的文本
                if not session.menu_buf:
                    logger.debug(f"[CallFSM] VAD end but menu_buf is empty, skipping")
                    return None

                # 如果已经有一个 deciding_task 在运行，不启动新的决策
                if session.deciding_task is not None and not session.deciding_task.done():
                    logger.debug(
                        f"[CallFSM] Already deciding for segment {session.deciding_segment}, "
                        f"buffering to next_buf"
                    )
                    # 将当前 menu_buf 移到 next_buf，等待当前决策完成
                    session.next_buf.extend(session.menu_buf)
                    session.menu_buf.clear()
                    return None

                # 合并所有收集到的文本
                combined_text = " ".join(session.menu_buf)
                session.menu_buf.clear()
                session.segment_idx += 1

                if not combined_text.strip():
                    return None

                logger.info(
                    f"[CallFSM] Triggering decide_for_asr_final: session={session_id}, "
                    f"segment={session.segment_idx}, text='{combined_text[:80]}...'"
                )

                # 记录到 history
                session.history.append(Turn(
                    role="menu",
                    text=combined_text,
                    ts_ms=timestamp_ms
                ))

                # 创建决策任务并存储，以便其他事件可以检查是否正在决策中
                session.deciding_segment = session.segment_idx
                decision_coro = self._run_decision(session, combined_text)
                session.deciding_task = asyncio.create_task(decision_coro)
                
                # 保存 task 引用，然后释放锁，让其他事件可以检查 deciding_task
                task = session.deciding_task

            elif action == "update":
                # update 事件只更新 prob，不触发决策
                return None

        # 在锁外等待决策完成，这样其他事件可以继续处理
        if task is not None and session is not None:
            try:
                result = await task
                return result
            finally:
                # 决策完成后清理 task 引用
                async with self._get_lock():
                    if session.deciding_task is task:
                        session.deciding_task = None
        
        return None

    async def _run_decision(
        self,
        session: SessionState,
        text: str
    ) -> Tuple[str, list]:
        """
        运行 LLM 决策
        """
        try:
            final_text, trace = self.decide_for_asr_final(
                self.llm_client,
                session,
                text
            )

            # 记录 assistant 回复到 history
            if final_text:
                session.history.append(Turn(
                    role="assistant",
                    text=final_text,
                    ts_ms=int(time.time() * 1000)
                ))

            # 更新 last_tool
            if trace:
                session.last_tool = trace[-1] if trace else None

            logger.info(
                f"[CallFSM] Decision complete: session={session.session_id}, "
                f"response='{final_text[:80] if final_text else ''}...', "
                f"tools_called={len(trace)}"
            )

            # 如果 next_buf 有内容，移动到 menu_buf
            if session.next_buf:
                session.menu_buf.extend(session.next_buf)
                session.next_buf.clear()
                logger.debug(
                    f"[CallFSM] Moved next_buf to menu_buf, "
                    f"new menu_buf_len={len(session.menu_buf)}"
                )

            return final_text, trace

        except Exception as e:
            logger.error(f"[CallFSM] Decision failed: {e}", exc_info=True)
            session.retry_count += 1
            return "", []

    async def handle_call_event(
        self,
        session_id: str,
        status: str,
        call_sid: str,
        timestamp_ms: int
    ) -> None:
        """
        处理 call 生命周期事件
        """
        async with self._get_lock():
            session = self.get_or_create_session(session_id)
            session.last_event_ts = timestamp_ms

            if status == "connecting":
                session.call_active = True
                session.phase = "welcome"
                logger.info(f"[CallFSM] Call connecting: session={session_id}")

            elif status == "in_call":
                session.call_active = True
                logger.info(f"[CallFSM] Call active: session={session_id}")

            elif status in ("ending", "ended", "completed"):
                session.call_active = False
                session.phase = "end"
                logger.info(f"[CallFSM] Call ended: session={session_id}")
                # 可选：清理 session
                # self.remove_session(session_id)

    def get_session_state(self, session_id: str) -> Optional[SessionState]:
        """获取 session 状态（只读）"""
        return self.sessions.get(session_id)

    def get_all_sessions(self) -> Dict[str, SessionState]:
        """获取所有 session"""
        return self.sessions.copy()
