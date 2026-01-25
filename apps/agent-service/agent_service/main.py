"""Main entry point for Agent Service."""

import os
import sys
import time
import logging
import signal
from dotenv import load_dotenv

from agent_service.grpc_client import AgentBridgeClient
from agent_service.event_handler import EventHandler
from agent_service.llm_client import LLMClient
from agent_service.ivr_agent import IVRAgent

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


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global shutdown_requested
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_requested = True


def main():
    """Main function to run the agent service."""
    global shutdown_requested
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Starting Agent Service")
    
    # Get configuration from environment
    media_service_url = os.getenv("MEDIA_SERVICE_GRPC_URL", "localhost:50052")
    session_id = os.getenv("SESSION_ID", "")  # Empty = subscribe to all sessions
    if not session_id:
        session_id = "*"  # Wildcard to match all sessions
    event_filters = os.getenv("EVENT_FILTERS", "asr.*,call.*").split(",")
    
    # LLM configuration
    llm_api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
    llm_base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
    llm_model = os.getenv("LLM_MODEL", "deepseek-chat")
    
    if not llm_api_key:
        logger.error("No API key found! Set DEEPSEEK_API_KEY or OPENAI_API_KEY")
        return 1
    
    logger.info(f"Configuration:")
    logger.info(f"  Media Service URL: {media_service_url}")
    logger.info(f"  Session ID: {session_id}")
    logger.info(f"  Event Filters: {event_filters}")
    logger.info(f"  LLM Model: {llm_model}")
    logger.info(f"  LLM Base URL: {llm_base_url}")
    
    # Initialize LLM client
    try:
        llm_client = LLMClient(
            api_key=llm_api_key,
            base_url=llm_base_url,
            model=llm_model
        )
    except Exception as e:
        logger.error(f"Failed to initialize LLM client: {e}")
        return 1
    
    # Initialize IVR agent
    ivr_agent = IVRAgent(
        llm_client=llm_client,
        goal="Connect to a human representative"
    )
    
    # Initialize gRPC client
    client = AgentBridgeClient(media_service_url)
    
    # Define suggestion callback
    def on_suggestion(session_id: str, decision: dict):
        """Send agent suggestion back to media-service."""
        try:
            client.send_suggestion(session_id, decision)
            logger.info(f"Sent suggestion to media-service: Press '{decision['digit']}'")
        except Exception as e:
            logger.error(f"Failed to send suggestion: {e}")
    
    # Initialize event handler
    handler = EventHandler(ivr_agent=ivr_agent, on_suggestion=on_suggestion)
    
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
        # Cleanup
        logger.info("Shutting down...")
        try:
            client.stop_subscription()
            client.disconnect()
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        
        # Print final statistics
        stats = handler.get_statistics()
        logger.info(f"Final statistics: {stats}")
        logger.info("Agent Service stopped")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
