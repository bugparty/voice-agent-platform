"""Main entry point for Agent Service."""

import os
import sys
import time
import logging
import signal
import threading
from dotenv import load_dotenv

from agent_service.grpc_client import AgentBridgeClient
from agent_service.event_handler import EventHandler
from agent_service.agent import set_grpc_client, CallFSM, decide_for_asr_final

# Load environment variables
load_dotenv()

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# Global flag for graceful shutdown
shutdown_requested = False
shutdown_count = 0
current_client = None

# Cleanup timeout in seconds
CLEANUP_TIMEOUT = 3.0


def init_llm_client():
    """
    初始化 ChatGPT LLM 客户端
    如果没有配置 OPENAI_API_KEY，返回 None（FSM 将在 mock 模式下运行）
    
    支持的环境变量:
    - OPENAI_API_KEY: API 密钥（必需）
    - OPENAI_API_URL: API base URL（可选，用于兼容 OpenAI API 的其他服务）
    - OPENAI_MODEL: 使用的模型（可选，默认 gpt-4.1-mini）
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set, CallFSM will run without LLM")
        return None
    
    api_url = os.getenv("OPENAI_API_URL")
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    
    try:
        from openai import OpenAI
        
        # 构建 client 参数
        client_kwargs = {"api_key": api_key}
        if api_url:
            client_kwargs["base_url"] = api_url
            logger.info(f"Using custom OpenAI API URL: {api_url}")
        
        client = OpenAI(**client_kwargs)
        logger.info(f"OpenAI client initialized, model: {model}")
        return client
    except ImportError:
        logger.warning("openai package not installed, CallFSM will run without LLM")
        return None


def get_openai_model() -> str:
    """获取配置的 OpenAI 模型名称"""
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


def init_call_fsm() -> CallFSM:
    """
    初始化 FSM + LLM agent
    """
    llm_client = init_llm_client()

    fsm = CallFSM(
        llm_client=llm_client,
        decide_for_asr_final_fn=decide_for_asr_final,
    )

    return fsm
def run_with_timeout(func, timeout: float, description: str) -> bool:
    """Run a function with a timeout. Returns True if completed, False if timed out."""
    result = [False]
    
    def wrapper():
        try:
            func()
            result[0] = True
        except Exception as e:
            logger.debug(f"{description} failed: {e}")
            result[0] = True  # Still mark as done even if failed
    
    thread = threading.Thread(target=wrapper, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    
    if not result[0]:
        logger.warning(f"{description} timed out after {timeout}s")
    return result[0]


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global shutdown_requested, shutdown_count, current_client
    shutdown_count += 1
    
    if shutdown_count >= 2:
        logger.warning("Force exit requested (second signal received)")
        os._exit(1)
    
    logger.info(f"Received signal {signum}, initiating graceful shutdown... (press Ctrl+C again to force exit)")
    shutdown_requested = True
    if current_client is not None:
        run_with_timeout(current_client.stop_subscription, CLEANUP_TIMEOUT, "Stop subscription")
        run_with_timeout(current_client.disconnect, CLEANUP_TIMEOUT, "Disconnect")


def main():
    """Main function to run the agent service."""
    global shutdown_requested, current_client
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Starting Agent Service")
    
    # Get configuration from environment
    media_service_url = os.getenv("MEDIA_SERVICE_GRPC_URL", "localhost:50052")
    # "*" subscribes to all sessions (media-service handles the wildcard).
    session_id = os.getenv("SESSION_ID", "*")
    event_filters = os.getenv("EVENT_FILTERS", "vad.*,asr.*,call.*").split(",")
    
    logger.info(f"Configuration:")
    logger.info(f"  Media Service URL: {media_service_url}")
    logger.info(f"  Session ID: {session_id}")
    logger.info(f"  Event Filters: {event_filters}")
    
    # Initialize components
    client = AgentBridgeClient(media_service_url)
    current_client = client
    set_grpc_client(client)
    
    # Initialize CallFSM and wire to EventHandler
    call_fsm = init_call_fsm()
    handler = EventHandler(call_fsm=call_fsm)
    
    logger.info(f"  CallFSM initialized: LLM client {'available' if call_fsm.llm_client else 'not available'}")
    
    try:
        # Connect to media-service
        client.connect()
        
        # Define event callback
        def on_event(event):
            """Callback for processing events."""
            handler.handle_event(event)
            
            # Print statistics every 100 events
            stats = handler.get_statistics()
            if stats["total_events"] % 100 == 0:
                logger.info(f"Event statistics: {stats}")
        
        # Subscribe to events
        logger.info("Subscribing to session events...")
        
        # Note: This is a blocking call that processes events in a loop
        # In a production environment, you might want to run this in a thread
        # and handle multiple sessions concurrently
        client.subscribe(
            session_id=session_id,
            event_types=event_filters,
            on_event=on_event
        )
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Error in main loop: {e}", exc_info=True)
        return 1
    finally:
        # Cleanup with timeout
        logger.info("Shutting down...")
        run_with_timeout(client.stop_subscription, CLEANUP_TIMEOUT, "Stop subscription")
        run_with_timeout(client.disconnect, CLEANUP_TIMEOUT, "Disconnect")
        current_client = None
        
        # Print final statistics
        stats = handler.get_statistics()
        logger.info(f"Final statistics: {stats}")
        logger.info("Agent Service stopped")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
