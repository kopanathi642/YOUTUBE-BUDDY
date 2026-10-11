"""Integration test configuration with real database."""
import os
from pathlib import Path
import tempfile

# Test database - use SQLite with in-memory or temp file
TEST_DB_DIR = Path(tempfile.gettempdir()) / "youtube_buddy_test"
TEST_DB_DIR.mkdir(exist_ok=True)
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_DIR / 'test.db'}"

# Test storage directories
TEST_UPLOAD_DIR = str(TEST_DB_DIR / "uploads")
TEST_RENDER_DIR = str(TEST_DB_DIR / "rendered")
Path(TEST_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(TEST_RENDER_DIR).mkdir(parents=True, exist_ok=True)

# Test media files
TEST_MEDIA_DIR = Path(__file__).parent / "fixtures"
TEST_MEDIA_DIR.mkdir(exist_ok=True)

# Test configuration
TEST_CONFIG = {
    "ENVIRONMENT": "testing",
    "DEBUG": True,
    "DATABASE_URL": TEST_DATABASE_URL,
    "UPLOAD_DIR": TEST_UPLOAD_DIR,
    "RENDER_DIR": TEST_RENDER_DIR,
    "STORAGE_PROVIDER": "local",
    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),  # Will use real API if key is set
    "HUGGINGFACE_API_KEY": os.getenv("HUGGINGFACE_API_KEY"),
    "OLLAMA_BASE_URL": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "JWT_SECRET_KEY": "test_secret_key_do_not_use_in_production",
    "REDIS_URL": "redis://localhost:6379/1",  # Use DB 1 for testing
    "CELERY_BROKER_URL": "redis://localhost:6379/1",
    "CELERY_RESULT_BACKEND": "redis://localhost:6379/1",
}

print(f"Test database: {TEST_DATABASE_URL}")
print(f"Test upload dir: {TEST_UPLOAD_DIR}")
print(f"Test render dir: {TEST_RENDER_DIR}")
