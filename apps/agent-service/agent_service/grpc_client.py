"""gRPC client for connecting to media-service Agent Bridge."""

import grpc
import logging
from queue import Queue
from typing import Iterator, Callable, List

logger = logging.getLogger(__name__)


class AgentBridgeClient:
    """Client for subscribing to media-service events via gRPC."""

    def __init__(self, address: str):
        """
        Initialize the Agent Bridge client.
        
        Args:
            address: Address of media-service gRPC server (e.g., "localhost:50052")
        """
        self.address = address
        self.channel = None
        self.stub = None
        self.suggestion_queue = Queue()
        self._connected = False
        self._responses = None
        self._stop_requested = False
        
    def connect(self):
        """Establish connection to media-service."""
        try:
            logger.info(f"Connecting to media-service at {self.address}")
            self.channel = grpc.insecure_channel(self.address)
            
            # Import proto files (will be generated)
            try:
                from agent_service.proto import agent_pb2
                from agent_service.proto import agent_pb2_grpc
                
                self.stub = agent_pb2_grpc.AgentBridgeStub(self.channel)
                self._connected = True
                logger.info("Connected to media-service")
            except ImportError as e:
                logger.error(f"Failed to import proto files: {e}")
                logger.error("Please run: python -m grpc_tools.protoc -I../../packages/proto "
                           "--python_out=agent_service/proto --grpc_python_out=agent_service/proto "
                           "../../packages/proto/agent.proto")
                raise
                
        except Exception as e:
            logger.error(f"Failed to connect to media-service: {e}")
            raise
            
    def disconnect(self):
        """Close connection to media-service."""
        if self.channel:
            logger.info("Disconnecting from media-service")
            self.channel.close()
            self._connected = False
            
    def subscribe(
        self, 
        session_id: str, 
        event_types: List[str],
        on_event: Callable
    ) -> None:
        """
        Subscribe to session events.
        
        Args:
            session_id: Session ID to subscribe to
            event_types: List of event type filters (e.g., ["vad.*", "asr.*"])
            on_event: Callback function to handle incoming events
        """
        if not self._connected:
            raise RuntimeError("Not connected to media-service")
            
        from agent_service.proto import agent_pb2
        
        def request_generator() -> Iterator:
            """Generate request messages for the bidirectional stream."""
            # Send initial subscription request
            subscribe_request = agent_pb2.SubscribeRequest(
                session_id=session_id,
                event_types=event_types
            )
            
            yield agent_pb2.AgentMessage(
                session_id=session_id,
                subscribe=subscribe_request
            )
            
            logger.info(f"Subscribed to session {session_id} with filters: {event_types}")
            
            # Then send suggestions from queue
            while True:
                suggestion = self.suggestion_queue.get()
                if suggestion is None or self._stop_requested:  # Sentinel or stop flag
                    break
                    
                yield agent_pb2.AgentMessage(
                    session_id=session_id,
                    suggestion=suggestion
                )
                logger.debug(f"Sent suggestion {suggestion.suggestion_id}")
        
        try:
            # Start bidirectional stream
            responses = self.stub.Subscribe(request_generator())
            self._responses = responses
            
            # Process incoming events
            for event in responses:
                try:
                    on_event(event)
                except Exception as e:
                    logger.error(f"Error processing event: {e}", exc_info=True)
                    
        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.CANCELLED or self._stop_requested:
                logger.info("Subscription cancelled")
                return
            logger.error(f"gRPC error during subscription: {e.code()} - {e.details()}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during subscription: {e}", exc_info=True)
            raise
        finally:
            self._responses = None
    
    def send_suggestion(
        self,
        suggestion_id: str,
        plan: str,
        actions: List,
        confidence: float = 0.8
    ):
        """
        Send a suggestion to media-service.
        
        Args:
            suggestion_id: Unique identifier for this suggestion
            plan: Description of the suggested plan
            actions: List of actions to execute
            confidence: Confidence score (0.0 - 1.0)
        """
        from agent_service.proto import agent_pb2
        
        suggestion = agent_pb2.AgentSuggestion(
            suggestion_id=suggestion_id,
            plan=plan,
            actions=actions,
            confidence=confidence
        )
        
        self.suggestion_queue.put(suggestion)
        logger.info(f"Queued suggestion {suggestion_id}: {plan}")
        
    def stop_subscription(self):
        """Stop the current subscription."""
        self._stop_requested = True
        self.suggestion_queue.put(None)  # Sentinel value
        if self._responses is not None:
            try:
                self._responses.cancel()
            except Exception as e:
                logger.debug(f"Failed to cancel subscription: {e}")
        if self.channel is not None:
            try:
                self.channel.close()
            except Exception as e:
                logger.debug(f"Failed to close channel: {e}")
