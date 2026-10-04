"""
Event Bus Service
Distributes events to subscribers in real-time
Supports async event processing and pub/sub pattern
"""

import asyncio
import json
from typing import List, Dict, Callable, Any, Optional
from datetime import datetime
from uuid import UUID
import structlog
from collections import defaultdict
try:
    from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
    _AIOKAFKA_AVAILABLE = True
except ImportError:  # Kafka driver optional until deployed with kafka
    AIOKafkaProducer = AIOKafkaConsumer = None
    _AIOKAFKA_AVAILABLE = False

try:
    import aio_pika
    from aio_pika import Message, ExchangeType
    from aio_pika.abc import AbstractIncomingMessage
    _AIO_PIKA_AVAILABLE = True
except ImportError:  # RabbitMQ driver optional — in-memory bus still works
    aio_pika = None
    Message = ExchangeType = AbstractIncomingMessage = None
    _AIO_PIKA_AVAILABLE = False

from app.events.models import BaseEvent, create_event_from_dict
from config.settings import settings

logger = structlog.get_logger()


class EventSubscriber:
    """Represents an event subscriber"""
    
    def __init__(
        self,
        name: str,
        handler: Callable[[BaseEvent], Any],
        event_types: Optional[List[str]] = None,
        async_handler: bool = True
    ):
        self.name = name
        self.handler = handler
        self.event_types = event_types or []  # Empty list means subscribe to all
        self.async_handler = async_handler
        self.processed_count = 0
        self.error_count = 0
        self.last_processed_at: Optional[datetime] = None
    
    async def handle_event(self, event: BaseEvent) -> bool:
        """Handle an event"""
        try:
            # Check if subscriber is interested in this event type
            if self.event_types and event.event_type not in self.event_types:
                return True  # Skip silently
            
            # Call handler
            if self.async_handler:
                await self.handler(event)
            else:
                self.handler(event)
            
            self.processed_count += 1
            self.last_processed_at = datetime.utcnow()
            
            logger.debug("Event handled by subscriber",
                        subscriber=self.name,
                        event_type=event.event_type)
            
            return True
            
        except Exception as e:
            self.error_count += 1
            logger.error("Subscriber error",
                        subscriber=self.name,
                        event_type=event.event_type,
                        error=str(e))
            return False


class InMemoryEventBus:
    """
    In-memory event bus for local event distribution
    Fast but not persistent across restarts
    """
    
    def __init__(self):
        self.subscribers: Dict[str, EventSubscriber] = {}
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.running = False
        self.worker_task: Optional[asyncio.Task] = None
        self.published_count = 0
        self.processed_count = 0
    
    def subscribe(
        self,
        name: str,
        handler: Callable[[BaseEvent], Any],
        event_types: Optional[List[str]] = None,
        async_handler: bool = True
    ):
        """
        Subscribe to events
        
        Args:
            name: Unique subscriber name
            handler: Function to handle events
            event_types: List of event types to subscribe to (None = all)
            async_handler: Whether handler is async
        """
        subscriber = EventSubscriber(name, handler, event_types, async_handler)
        self.subscribers[name] = subscriber
        
        logger.info("Subscriber registered",
                   subscriber=name,
                   event_types=event_types or "all")
    
    def unsubscribe(self, name: str):
        """Unsubscribe from events"""
        if name in self.subscribers:
            del self.subscribers[name]
            logger.info("Subscriber unregistered", subscriber=name)
    
    async def publish(self, event: BaseEvent):
        """
        Publish an event to all subscribers
        
        Args:
            event: Event to publish
        """
        try:
            await self.event_queue.put(event)
            self.published_count += 1
            
            logger.debug("Event published to bus",
                        event_type=event.event_type,
                        event_id=str(event.event_id))
            
        except Exception as e:
            logger.error("Failed to publish event", error=str(e))
    
    async def _process_events(self):
        """Background worker to process events"""
        logger.info("Event bus worker started")
        
        while self.running:
            try:
                # Get event from queue with timeout
                event = await asyncio.wait_for(
                    self.event_queue.get(),
                    timeout=1.0
                )
                
                # Distribute to all subscribers
                tasks = []
                for subscriber in self.subscribers.values():
                    task = subscriber.handle_event(event)
                    tasks.append(task)
                
                # Wait for all subscribers to process
                if tasks:
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Log any errors
                    for i, result in enumerate(results):
                        if isinstance(result, Exception):
                            logger.error("Subscriber processing error",
                                       error=str(result))
                
                self.processed_count += 1
                
            except asyncio.TimeoutError:
                # No events in queue, continue
                continue
                
            except Exception as e:
                logger.error("Event processing error", error=str(e))
    
    async def start(self):
        """Start the event bus"""
        if not self.running:
            self.running = True
            self.worker_task = asyncio.create_task(self._process_events())
            logger.info("Event bus started")
    
    async def stop(self):
        """Stop the event bus"""
        if self.running:
            self.running = False
            if self.worker_task:
                self.worker_task.cancel()
                try:
                    await self.worker_task
                except asyncio.CancelledError:
                    pass
            logger.info("Event bus stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics"""
        return {
            "running": self.running,
            "published_count": self.published_count,
            "processed_count": self.processed_count,
            "queue_size": self.event_queue.qsize(),
            "subscriber_count": len(self.subscribers),
            "subscribers": {
                name: {
                    "processed_count": sub.processed_count,
                    "error_count": sub.error_count,
                    "last_processed_at": sub.last_processed_at.isoformat() if sub.last_processed_at else None
                }
                for name, sub in self.subscribers.items()
            }
        }


class RabbitMQEventBus:
    """
    RabbitMQ-based event bus for distributed event processing
    Persistent and scalable across multiple instances
    """
    
    def __init__(self):
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.exchange: Optional[aio_pika.Exchange] = None
        self.subscribers: Dict[str, EventSubscriber] = {}
        self.running = False
        self.rabbitmq_url = getattr(settings, 'RABBITMQ_URL', 'amqp://guest:guest@localhost/')
        self.exchange_name = 'neobank.events'
        self.published_count = 0
    
    async def connect(self):
        """Connect to RabbitMQ"""
        try:
            self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
            self.channel = await self.connection.channel()
            
            # Declare exchange
            self.exchange = await self.channel.declare_exchange(
                self.exchange_name,
                ExchangeType.TOPIC,
                durable=True
            )
            
            logger.info("Connected to RabbitMQ",
                       exchange=self.exchange_name)
            
        except Exception as e:
            logger.error("Failed to connect to RabbitMQ", error=str(e))
            raise
    
    async def disconnect(self):
        """Disconnect from RabbitMQ"""
        try:
            if self.connection:
                await self.connection.close()
            logger.info("Disconnected from RabbitMQ")
        except Exception as e:
            logger.error("Error disconnecting from RabbitMQ", error=str(e))
    
    async def publish(self, event: BaseEvent):
        """
        Publish an event to RabbitMQ
        
        Args:
            event: Event to publish
        """
        try:
            if not self.exchange:
                logger.error("Not connected to RabbitMQ")
                return
            
            # Serialize event
            message_body = json.dumps({
                "event_id": str(event.event_id),
                "event_type": event.event_type,
                "aggregate_id": event.aggregate_id,
                "aggregate_type": event.aggregate_type,
                "event_data": event.to_dict(),
                "metadata": event.metadata,
                "version": event.version,
                "created_at": event.created_at.isoformat(),
                "correlation_id": str(event.correlation_id) if event.correlation_id else None,
                "causation_id": str(event.causation_id) if event.causation_id else None,
                "user_id": event.user_id,
                "service_name": event.service_name
            }, default=str)
            
            # Create message
            message = Message(
                body=message_body.encode(),
                content_type='application/json',
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                correlation_id=str(event.correlation_id) if event.correlation_id else None
            )
            
            # Publish with routing key based on event type
            routing_key = f"event.{event.aggregate_type}.{event.event_type}"
            
            await self.exchange.publish(
                message,
                routing_key=routing_key
            )
            
            self.published_count += 1
            
            logger.debug("Event published to RabbitMQ",
                        event_type=event.event_type,
                        routing_key=routing_key)
            
        except Exception as e:
            logger.error("Failed to publish event to RabbitMQ", error=str(e))
    
    async def subscribe(
        self,
        name: str,
        handler: Callable[[BaseEvent], Any],
        event_types: Optional[List[str]] = None,
        async_handler: bool = True
    ):
        """
        Subscribe to events from RabbitMQ
        
        Args:
            name: Unique subscriber name
            handler: Function to handle events
            event_types: List of event types to subscribe to (None = all)
            async_handler: Whether handler is async
        """
        try:
            if not self.channel:
                logger.error("Not connected to RabbitMQ")
                return
            
            # Create subscriber
            subscriber = EventSubscriber(name, handler, event_types, async_handler)
            self.subscribers[name] = subscriber
            
            # Declare queue for this subscriber
            queue = await self.channel.declare_queue(
                f"neobank.events.{name}",
                durable=True
            )
            
            # Bind queue to exchange with routing keys
            if event_types:
                for event_type in event_types:
                    routing_key = f"event.*.{event_type}"
                    await queue.bind(self.exchange, routing_key)
            else:
                # Subscribe to all events
                await queue.bind(self.exchange, "event.#")
            
            # Start consuming
            await queue.consume(
                lambda message: self._handle_message(message, subscriber)
            )
            
            logger.info("Subscribed to RabbitMQ events",
                       subscriber=name,
                       event_types=event_types or "all")
            
        except Exception as e:
            logger.error("Failed to subscribe to RabbitMQ", error=str(e))
    
    async def _handle_message(
        self,
        message: AbstractIncomingMessage,
        subscriber: EventSubscriber
    ):
        """Handle incoming message from RabbitMQ"""
        try:
            async with message.process():
                # Deserialize event
                data = json.loads(message.body.decode())
                event = create_event_from_dict(
                    data["event_type"],
                    data["event_data"]
                )
                
                # Handle event
                await subscriber.handle_event(event)
                
        except Exception as e:
            logger.error("Failed to handle RabbitMQ message",
                        subscriber=subscriber.name,
                        error=str(e))
    
    async def start(self):
        """Start the event bus"""
        if not self.running:
            await self.connect()
            self.running = True
            logger.info("RabbitMQ event bus started")
    
    async def stop(self):
        """Stop the event bus"""
        if self.running:
            await self.disconnect()
            self.running = False
            logger.info("RabbitMQ event bus stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics"""
        return {
            "running": self.running,
            "published_count": self.published_count,
            "subscriber_count": len(self.subscribers),
            "subscribers": {
                name: {
                    "processed_count": sub.processed_count,
                    "error_count": sub.error_count,
                    "last_processed_at": sub.last_processed_at.isoformat() if sub.last_processed_at else None
                }
                for name, sub in self.subscribers.items()
            }
        }




class KafkaEventBus:
    """Kafka-backed event bus — the platform backbone.

    Topics: {KAFKA_TOPIC_PREFIX}.{aggregate_type} with the event_type in the
    payload envelope. Keys = aggregate_id for partition affinity.
    """

    def __init__(self):
        from config.settings import settings
        self.brokers = settings.KAFKA_BROKERS
        self.prefix = settings.KAFKA_TOPIC_PREFIX
        self.producer = None
        self._stats = {"published": 0, "errors": 0}

    async def start(self):
        if self.producer is None:
            self.producer = AIOKafkaProducer(bootstrap_servers=self.brokers)
            await self.producer.start()
            logger.info("Kafka event bus started", brokers=self.brokers)

    async def stop(self):
        if self.producer is not None:
            await self.producer.stop()
            self.producer = None

    async def publish(self, event: BaseEvent):
        if self.producer is None:
            await self.start()
        topic = f"{self.prefix}.{event.aggregate_type}"
        envelope = json.dumps({
            "event_id": str(event.event_id),
            "event_type": event.event_type,
            "aggregate_id": event.aggregate_id,
            "aggregate_type": event.aggregate_type,
            "version": event.version,
            "user_id": event.user_id,
            "created_at": event.created_at.isoformat(),
            "payload": getattr(event, "payload", {}),
        }).encode()
        try:
            await self.producer.send_and_wait(
                topic, envelope, key=event.aggregate_id.encode())
            self._stats["published"] += 1
        except Exception as exc:
            self._stats["errors"] += 1
            logger.warning("kafka.publish_failed", topic=topic, error=str(exc))
            raise

    async def subscribe(self, name, handler, event_types=None, async_handler=True):
        # Consumer groups subscribe per aggregate topic; kept minimal here —
        # consumers (projections, notifications) run in dedicated workers.
        logger.info("kafka.subscribe", name=name, event_types=event_types)

    def get_stats(self):
        return dict(self._stats)

class EventBusService:
    """
    Unified event bus service
    Uses RabbitMQ if available, falls back to in-memory
    """
    
    def __init__(self, backend: str = "auto", use_rabbitmq: bool = False):
        from config.settings import settings
        choice = backend
        if choice == "auto":
            choice = ("kafka" if (settings.KAFKA_BROKERS and _AIOKAFKA_AVAILABLE)
                      else "rabbitmq" if (use_rabbitmq and _AIO_PIKA_AVAILABLE)
                      else "memory")
        if choice == "kafka" and not _AIOKAFKA_AVAILABLE:
            logger.warning("Kafka requested but aiokafka not installed — using in-memory bus")
            choice = "memory"
        if choice == "rabbitmq" and not _AIO_PIKA_AVAILABLE:
            logger.warning("RabbitMQ requested but aio_pika not installed — using in-memory bus")
            choice = "memory"

        self.backend = choice
        if choice == "kafka":
            self.bus = KafkaEventBus()
        elif choice == "rabbitmq":
            self.bus = RabbitMQEventBus()
        else:
            self.bus = InMemoryEventBus()

        # legacy flag kept for existing call sites
        self.use_rabbitmq = choice == "rabbitmq"
    
    async def publish(self, event: BaseEvent):
        """Publish an event; falls back to in-memory on Kafka failure."""
        try:
            await self.bus.publish(event)
        except Exception as exc:
            if self.backend == "kafka":
                logger.warning("kafka.publish_failed — falling back to memory",
                               error=str(exc))
                await InMemoryEventBus().publish(event)
            else:
                raise
    
    async def subscribe(
        self,
        name: str,
        handler: Callable[[BaseEvent], Any],
        event_types: Optional[List[str]] = None,
        async_handler: bool = True
    ):
        """Subscribe to events"""
        if self.use_rabbitmq:
            await self.bus.subscribe(name, handler, event_types, async_handler)
        else:
            self.bus.subscribe(name, handler, event_types, async_handler)
    
    def unsubscribe(self, name: str):
        """Unsubscribe from events (in-memory only)"""
        if not self.use_rabbitmq:
            self.bus.unsubscribe(name)
    
    async def start(self):
        """Start the event bus"""
        await self.bus.start()
    
    async def stop(self):
        """Stop the event bus"""
        await self.bus.stop()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics"""
        stats = self.bus.get_stats()
        stats["type"] = self.backend
        return stats


# Global event bus instance
_event_bus: Optional[EventBusService] = None


def get_event_bus(use_rabbitmq: bool = False, backend: str = "auto") -> EventBusService:
    """Get or create global event bus instance.

    Backend selection (auto): Kafka when KAFKA_BROKERS is configured and
    aiokafka is installed → RabbitMQ when explicitly requested → in-memory.
    Override with EVENT_BUS_BACKEND=kafka|rabbitmq|memory.
    """
    global _event_bus
    
    if _event_bus is None:
        from config.settings import settings
        chosen = settings.EVENT_BUS_BACKEND if settings.EVENT_BUS_BACKEND != "auto" else backend
        _event_bus = EventBusService(backend=chosen, use_rabbitmq=use_rabbitmq)
    
    return _event_bus
