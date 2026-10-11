import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env", override=False)


class Settings(BaseModel):
    APP_NAME: str = "YouTube Buddy Backend"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    API_PREFIX: str = os.getenv("API_V1_PREFIX", "/api/v1")
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "http://localhost:8000")
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./dev.db",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    CELERY_TASK_ALWAYS_EAGER: bool = os.getenv("CELERY_TASK_ALWAYS_EAGER", "False").lower() == "true"

    # OpenAI Configuration
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    OPENAI_IMAGE_MODEL: str = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
    OPENAI_TRANSCRIPTION_MODEL: str = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
    AI_REQUEST_TIMEOUT_SECONDS: int = int(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "120"))

    # Hugging Face Configuration
    HUGGINGFACE_API_KEY: str | None = os.getenv("HUGGINGFACE_API_KEY")
    HUGGINGFACE_MODEL: str = os.getenv("HUGGINGFACE_MODEL", "microsoft/DialoGPT-medium")
    HUGGINGFACE_TEXT_MODEL: str = os.getenv("HUGGINGFACE_TEXT_MODEL", "microsoft/DialoGPT-medium")
    HUGGINGFACE_IMAGE_MODEL: str = os.getenv("HUGGINGFACE_IMAGE_MODEL", "stabilityai/stable-diffusion-2-1")
    HUGGINGFACE_AUDIO_MODEL: str | None = os.getenv("HUGGINGFACE_AUDIO_MODEL")

    # Ollama Configuration
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")

    # Google Gemini Configuration (Free tier: 15 RPM, 1M tokens/day)
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # Security
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET", "super_secret_key_change_in_production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    DEMO_LOGIN_EMAIL: str = os.getenv("DEMO_LOGIN_EMAIL", "demo@youtubebuddy.local")
    DEMO_LOGIN_PASSWORD: str = os.getenv("DEMO_LOGIN_PASSWORD", "Demo@12345")

    # Storage
    STORAGE_PROVIDER: str = os.getenv("STORAGE_PROVIDER", "local")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    RENDER_DIR: str = os.getenv("RENDER_DIR", "rendered")
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", "10737418240"))

    # Firebase Configuration - USED ONLY FOR:
    # - Google Login Authentication
    # - YouTube OAuth
    # - Firebase Storage (when STORAGE_PROVIDER=firebase)
    FIREBASE_PROJECT_ID: str | None = os.getenv("FIREBASE_PROJECT_ID")
    FIREBASE_CLIENT_ID: str | None = os.getenv("FIREBASE_CLIENT_ID")
    FIREBASE_CLIENT_EMAIL: str | None = os.getenv("FIREBASE_CLIENT_EMAIL")
    FIREBASE_PRIVATE_KEY: str | None = os.getenv("FIREBASE_PRIVATE_KEY")
    FIREBASE_STORAGE_BUCKET: str | None = os.getenv("FIREBASE_STORAGE_BUCKET")
    FIREBASE_SERVICE_ACCOUNT_PATH: str | None = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    FIREBASE_STORAGE_BASE_URL: str = "https://firebasestorage.googleapis.com/v0/b"

    # CDN / production file serving
    STORAGE_CDN_URL: str | None = os.getenv("STORAGE_CDN_URL")

    model_config = {"env_file": str(BACKEND_DIR / ".env")}


settings = Settings()
