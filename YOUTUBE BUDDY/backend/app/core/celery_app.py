"""
Production Celery application configuration.

Defines task routing, serialisation, retry policies, and
optional beat schedule for periodic maintenance tasks.
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "youtube_buddy",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Worker behaviour
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks (memory hygiene)

    # Rate limiting
    task_annotations={"*": {"rate_limit": "10/s"}},

    # Broker
    broker_transport_options={"visibility_timeout": 3600},
    broker_connection_retry_on_startup=True,

    # Task routing — separate queues for different workloads
    task_routes={
        "tasks.render_short": {"queue": "video"},
        "tasks.render_short_with_captions": {"queue": "video"},
        "tasks.generate_thumbnail": {"queue": "video"},
        "tasks.transcribe": {"queue": "audio"},
        "tasks.viral_clip_analysis": {"queue": "ai"},
        "tasks.generate_image": {"queue": "ai"},
        "tasks.generate_text": {"queue": "ai"},
        "tasks.health_check": {"queue": "default"},
    },

    # Default queue for unrouted tasks
    task_default_queue="default",

    # Result expiry — 24 hours
    result_expires=86400,

    # Eager mode for testing (synchronous execution, no broker needed)
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.workers"])

if __name__ == "__main__":
    celery_app.start()
