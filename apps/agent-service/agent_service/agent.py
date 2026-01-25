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

def register_tool(
    name: str,
    schema: Dict[str, Any],
    fn: ToolFn,
    *,
    description: Optional[str] = None,
) -> None:
    """
    Register a tool for the Agent to call.

    Args:
        name: Tool name; must match LLM function calling.
        schema: JSON Schema describing parameters (type, object, etc.).
        fn: The function to execute; signature (args: Dict[str, Any]) -> Any.
        description: Function description for the LLM to decide when to call; if omitted, "Tool: {name}" is used.
    """
    TOOLS[name] = {"schema": schema, "fn": fn, "description": description}

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
    # Lifecycle
    phase: str               # welcome | menu | verify | transfer | end
    call_active: bool

    # Time-related
    last_event_ts: int
    silence_ms: int

    # Speech / barge-in
    user_speaking: bool
    can_barge_in: bool

    # Retry / errors
    retry_count: int

    # Allowed actions (hard rules)
    can_transfer: bool

register_tool(
    "type_dtmf",
    schema={
        "type": "object",
        "properties": {"digit": {"type": "string"}},
        "required": ["digit"]
    },
    fn=type_dtmf,
    description="Press a DTMF key on the phone keypad. Use when selecting IVR menu options, entering a digit of the prescription number, etc. The digit parameter is one of 0-9, *, #.",
)

register_tool(
    "speak_to_user",
    schema={
        "type": "object",
        "properties": {"text": {"type": "string"}},
        "required": ["text"]
    },
    fn=speak_to_user,
    description="Say something to the user; shown in the web UI via Copilot. Use when explaining, confirming, or when a human agent has been reached.",
)
def build_tools_payload():
    tools = []
    for name, t in TOOLS.items():
        desc = t.get("description") or f"Tool: {name}"
        tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": desc,
                "parameters": t["schema"]
            }
        })
    return tools
def run_agent_loop(client, model: str, messages: list, max_steps: int = 6):
    """
    client: Your OpenAI client (or compatible API).
    messages: Chat messages (system/user/assistant/tool).
    Returns: final assistant content + tool call trace for the run.
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

        # 1) Has tool calls: run each tool
        tool_calls = getattr(msg, "tool_calls", None)
        if tool_calls:
            # First append the assistant's tool_call message to context
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
                    # Run the tool
                    if name not in TOOLS:
                        result = {"ok": False, "error": f"unknown_tool: {name}"}
                    else:
                        try:
                            result = TOOLS[name]["fn"](args)
                        except Exception as e:
                            result = {"ok": False, "error": f"tool_exception: {e}"}

                tool_trace.append({"tool": name, "args": raw_args, "result": result})

                # Append tool result as role=tool to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })

            # Continue loop so the model can reason from tool results
            continue

        # 2) No tool call: treat as final reply
        final_text = msg.content or ""
        messages.append({"role": "assistant", "content": final_text})
        return final_text, tool_trace

    # Exceeded max_steps: fallback
    return "I’m sorry—I'm having trouble completing that request right now.", tool_trace

def decide_for_asr_final(client, session_state, text: str, model: str = None):
    """
    Make a decision based on ASR final text.

    Args:
        client: OpenAI client
        session_state: SessionState instance
        text: ASR final text
        model: Model name (optional; defaults to OPENAI_MODEL env var)
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
            "if being asked about the prescription number, the  prescription number is 1"
            "if being asked about the birth date, the birth date is 09/01/92"
            "you prefer prescription number than birth date"
            
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

    # history (final turns only)
    # Map "menu" role to "assistant" (IVR menu is system-played speech)
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
    COLLECT_MENU = auto()     # Collect a menu ASR segment
    DECIDING = auto()         # Trigger agent on VAD stop; keep collecting next segment meanwhile
    CONNECTED = auto()
    ENDED = auto()


@dataclass
class Turn:
    role: str      # "system" | "user" | "assistant" | "menu" (menu is mapped to assistant when calling the API)
    text: str
    ts_ms: int


@dataclass
class SessionState:
    session_id: str

    # Lifecycle / phase
    phase: str = "welcome"        # decide_for_asr_final uses string; keep it as string here
    call_active: bool = True

    # Time-related
    last_event_ts: int = 0
    silence_ms: int = 0

    # Speech / barge-in
    user_speaking: bool = False
    can_barge_in: bool = True

    # Retry / errors
    retry_count: int = 0

    # Allowed actions
    can_transfer: bool = True      # Change here if you add a verify gate later

    # Structured memory (aligned with decide_for_asr_final)
    slots: Dict[str, Any] = field(default_factory=dict)
    last_tool: Optional[Dict[str, Any]] = None
    history: Deque[Turn] = field(default_factory=lambda: deque(maxlen=20))

    # Menu segment collection buffers
    menu_buf: List[str] = field(default_factory=list)      # Current segment
    next_buf: List[str] = field(default_factory=list)      # Next segment received during DECIDING

    segment_idx: int = 0
    deciding_task: Optional[asyncio.Task] = None
    deciding_segment: Optional[int] = None

    # For your "simulated pharmacy fixed flow" prompt (optional)
    step_idx: int = 0   # 0=first level, 1=second level, 2=pharmacist code


# ----------------------------
# 2) FSM: only "when to trigger agent", not direct keypress
# ----------------------------

class CallFSM:
    """
    Input: call/vad/asr events.

    Responsibilities:
    - Collect ASR final text into buffer
    - On VAD stop (end), merge buffer and call decide_for_asr_final
    - Manage session state and lifecycle
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
        """Get or create session state."""
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionState(session_id=session_id)
            logger.info(f"[CallFSM] Created new session: {session_id}")
        return self.sessions[session_id]

    def remove_session(self, session_id: str) -> None:
        """Remove session."""
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
        Handle ASR event.

        - Only collect final events
        - Append text to menu_buf (or to next_buf if DECIDING)
        """
        if not is_final:
            # Ignore partial events
            return

        if not text or not text.strip():
            return

        async with self._get_lock():
            session = self.get_or_create_session(session_id)
            session.last_event_ts = timestamp_ms

            # If in DECIDING, append to next_buf for the next round
            if session.deciding_task is not None and not session.deciding_task.done():
                session.next_buf.append(text.strip())
                logger.debug(
                    f"[CallFSM] ASR final (to next_buf): session={session_id}, "
                    f"text='{text[:50]}...', next_buf_len={len(session.next_buf)}"
                )
            else:
                # Normally append to menu_buf
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
        Handle VAD event.

        - action="start": set user_speaking=True
        - action="end": merge menu_buf, trigger decide_for_asr_final

        Returns: (final_text, tool_trace) if decision was triggered, else None.
        """
        # Variables for waiting outside the lock
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

                # Check if any text was collected
                if not session.menu_buf:
                    logger.debug(f"[CallFSM] VAD end but menu_buf is empty, skipping")
                    return None

                # If a deciding_task is already running, do not start a new decision
                if session.deciding_task is not None and not session.deciding_task.done():
                    logger.debug(
                        f"[CallFSM] Already deciding for segment {session.deciding_segment}, "
                        f"buffering to next_buf"
                    )
                    # Move current menu_buf to next_buf, wait for current decision to finish
                    session.next_buf.extend(session.menu_buf)
                    session.menu_buf.clear()
                    return None

                # Merge all collected text
                combined_text = " ".join(session.menu_buf)
                session.menu_buf.clear()
                session.segment_idx += 1

                if not combined_text.strip():
                    return None

                logger.info(
                    f"[CallFSM] Triggering decide_for_asr_final: session={session_id}, "
                    f"segment={session.segment_idx}, text='{combined_text[:80]}...'"
                )

                # Append to history
                session.history.append(Turn(
                    role="menu",
                    text=combined_text,
                    ts_ms=timestamp_ms
                ))

                # Create and store the decision task so other events can check if a decision is in progress
                session.deciding_segment = session.segment_idx
                decision_coro = self._run_decision(session, combined_text)
                session.deciding_task = asyncio.create_task(decision_coro)
                
                # Save task ref and release lock so other events can check deciding_task
                task = session.deciding_task

            elif action == "update":
                # update event only updates prob, does not trigger decision
                return None

        # Wait for decision outside the lock so other events can continue
        if task is not None and session is not None:
            try:
                result = await task
                return result
            finally:
                # Clear task ref after decision completes
                async with self._get_lock():
                    if session.deciding_task is task:
                        session.deciding_task = None
        
        return None

    async def _run_decision(
        self,
        session: SessionState,
        text: str
    ) -> Tuple[str, list]:
        """Run LLM decision."""
        try:
            final_text, trace = self.decide_for_asr_final(
                self.llm_client,
                session,
                text
            )

            # Append assistant reply to history
            if final_text:
                session.history.append(Turn(
                    role="assistant",
                    text=final_text,
                    ts_ms=int(time.time() * 1000)
                ))

            # Update last_tool
            if trace:
                session.last_tool = trace[-1] if trace else None

            logger.info(
                f"[CallFSM] Decision complete: session={session.session_id}, "
                f"response='{final_text[:80] if final_text else ''}...', "
                f"tools_called={len(trace)}"
            )

            # If next_buf has content, move it to menu_buf
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
        """Handle call lifecycle event."""
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
                # Optional: clear session
                # self.remove_session(session_id)

    def get_session_state(self, session_id: str) -> Optional[SessionState]:
        """Get session state (read-only)."""
        return self.sessions.get(session_id)

    def get_all_sessions(self) -> Dict[str, SessionState]:
        """Get all sessions."""
        return self.sessions.copy()
