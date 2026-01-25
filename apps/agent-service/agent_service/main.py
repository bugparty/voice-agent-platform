"""Main entry point for Agent Service."""

import os
import sys
import time
import logging
import signal
from dotenv import load_dotenv

from agent_service.grpc_client import AgentBridgeClient
from agent_service.event_handler import EventHandler

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
    session_id = os.getenv("SESSION_ID", "test-session")
    event_filters = os.getenv("EVENT_FILTERS", "vad.*,asr.*,call.*").split(",")
    
    logger.info(f"Configuration:")
    logger.info(f"  Media Service URL: {media_service_url}")
    logger.info(f"  Session ID: {session_id}")
    logger.info(f"  Event Filters: {event_filters}")
    
    # Initialize components
    client = AgentBridgeClient(media_service_url)
    handler = EventHandler()
    
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
