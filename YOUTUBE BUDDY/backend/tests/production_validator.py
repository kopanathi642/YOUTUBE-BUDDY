"""Production deployment guide and validation script."""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple


class ProductionValidator:
    """Validates production environment setup."""
    
    def __init__(self):
        self.issues: List[Tuple[str, str]] = []
        self.warnings: List[Tuple[str, str]] = []
        self.successes: List[str] = []
    
    def check_env_var(self, var_name: str, required: bool = True) -> bool:
        """Check if environment variable exists."""
        value = os.getenv(var_name)
        
        if not value:
            msg = f"Environment variable {var_name} not set"
            if required:
                self.issues.append(("ENV_VAR", msg))
                return False
            else:
                self.warnings.append(("ENV_VAR", msg))
                return False
        
        self.successes.append(f"{var_name} is configured")
        return True
    
    def check_command_exists(self, command: str) -> bool:
        """Check if system command exists."""
        import shutil
        
        if not shutil.which(command):
            self.issues.append(("COMMAND", f"Command '{command}' not found in PATH"))
            return False
        
        self.successes.append(f"Command '{command}' available")
        return True
    
    def check_directory_exists(self, path: str, create: bool = True) -> bool:
        """Check if directory exists."""
        dir_path = Path(path)
        
        if not dir_path.exists():
            if create:
                try:
                    dir_path.mkdir(parents=True, exist_ok=True)
                    self.successes.append(f"Created directory: {path}")
                    return True
                except Exception as e:
                    self.issues.append(("DIRECTORY", f"Cannot create {path}: {e}"))
                    return False
            else:
                self.issues.append(("DIRECTORY", f"Directory not found: {path}"))
                return False
        
        self.successes.append(f"Directory exists: {path}")
        return True
    
    def validate_api_keys(self) -> bool:
        """Validate API key configurations."""
        keys = {
            "OPENAI_API_KEY": ("OpenAI", True),
            "HUGGINGFACE_API_KEY": ("Hugging Face", False),
            "FIREBASE_PROJECT_ID": ("Firebase", False),
        }
        
        all_valid = True
        for key, (service, required) in keys.items():
            if self.check_env_var(key, required=required):
                # Validate format
                value = os.getenv(key)
                if key == "OPENAI_API_KEY" and not value.startswith("sk-"):
                    self.issues.append(("API_KEY", f"{service} API key has wrong format"))
                    all_valid = False
            else:
                if required:
                    all_valid = False
        
        return all_valid
    
    def validate_database_config(self) -> bool:
        """Validate database configuration."""
        db_url = os.getenv("DATABASE_URL")
        
        if not db_url:
            self.issues.append(("DATABASE", "DATABASE_URL not set"))
            return False
        
        # Check for supported databases
        supported = ["postgresql", "mysql", "sqlite"]
        if not any(db in db_url for db in supported):
            self.warnings.append(("DATABASE", f"Unusual database: {db_url[:30]}..."))
        
        self.successes.append(f"Database configured: {db_url.split('://')[0]}")
        return True
    
    def validate_redis_config(self) -> bool:
        """Validate Redis configuration."""
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        
        if "localhost" in redis_url and os.getenv("ENVIRONMENT") == "production":
            self.warnings.append(("REDIS", "Using localhost Redis in production"))
        
        self.successes.append(f"Redis configured: {redis_url}")
        return True
    
    def validate_file_permissions(self) -> bool:
        """Validate file permissions for upload/render directories."""
        dirs = [
            os.getenv("UPLOAD_DIR", "uploads"),
            os.getenv("RENDER_DIR", "rendered"),
        ]
        
        all_valid = True
        for dir_path in dirs:
            if self.check_directory_exists(dir_path, create=True):
                # Check write permissions
                test_file = Path(dir_path) / ".write_test"
                try:
                    test_file.write_text("test")
                    test_file.unlink()
                    self.successes.append(f"Write permission verified: {dir_path}")
                except Exception as e:
                    self.issues.append(("PERMISSIONS", f"Cannot write to {dir_path}: {e}"))
                    all_valid = False
            else:
                all_valid = False
        
        return all_valid
    
    def generate_report(self) -> str:
        """Generate validation report."""
        report = []
        report.append("\n" + "="*70)
        report.append("PRODUCTION DEPLOYMENT VALIDATION REPORT")
        report.append("="*70 + "\n")
        
        # Successes
        if self.successes:
            report.append("[PASSED] VALIDATION PASSED:")
            for success in self.successes:
                report.append(f"  [+] {success}")
            report.append("")
        
        # Warnings
        if self.warnings:
            report.append("[WARNING] WARNINGS:")
            for category, msg in self.warnings:
                report.append(f"  [!] [{category}] {msg}")
            report.append("")
        
        # Issues
        if self.issues:
            report.append("[FAILED] CRITICAL ISSUES (MUST FIX):")
            for category, msg in self.issues:
                report.append(f"  [-] [{category}] {msg}")
            report.append("")
        
        # Summary
        report.append("SUMMARY:")
        report.append(f"  Passed:    {len(self.successes)}")
        report.append(f"  Warnings:  {len(self.warnings)}")
        report.append(f"  Errors:    {len(self.issues)}")
        
        if self.issues:
            report.append("\nSTATUS: [FAILED] - Fix issues above before deploying")
        elif self.warnings:
            report.append("\nSTATUS: [WARNING] PROCEED WITH CAUTION - Address warnings")
        else:
            report.append("\nSTATUS: [OK] READY FOR PRODUCTION")
        
        report.append("="*70 + "\n")
        
        return "\n".join(report)


def validate_production_setup():
    """Run full production validation."""
    validator = ProductionValidator()
    
    print("Validating production setup...\n")
    
    # Check required environment variables
    print("1. Checking environment variables...")
    validator.check_env_var("DATABASE_URL")
    validator.check_env_var("OPENAI_API_KEY")
    validator.check_env_var("JWT_SECRET_KEY")
    validator.check_env_var("ENVIRONMENT")
    
    # Check API keys
    print("2. Validating API keys...")
    validator.validate_api_keys()
    
    # Check system commands
    print("3. Checking system commands...")
    validator.check_command_exists("ffmpeg")
    validator.check_command_exists("ffprobe")
    
    # Check database
    print("4. Validating database configuration...")
    validator.validate_database_config()
    
    # Check Redis
    print("5. Validating Redis configuration...")
    validator.validate_redis_config()
    
    # Check file permissions
    print("6. Validating file permissions...")
    validator.validate_file_permissions()
    
    # Generate report
    report = validator.generate_report()
    print(report)
    
    return len(validator.issues) == 0


def generate_production_env_template():
    """Generate template for production .env file."""
    template = """# YouTube Buddy Production Environment Configuration
# Copy this file to backend/.env and fill in all required values

# Application Settings
ENVIRONMENT=production
DEBUG=False
APP_NAME=YouTube Buddy Backend
BACKEND_HOST=https://yourdomain.com

# API Configuration
API_V1_PREFIX=/api/v1

# Database Configuration (PostgreSQL recommended for production)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/youtube_buddy

# Redis Configuration (for caching and Celery)
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Storage Configuration
STORAGE_PROVIDER=local  # or 'gcs' for Google Cloud Storage
UPLOAD_DIR=/var/youtube_buddy/uploads
RENDER_DIR=/var/youtube_buddy/rendered
MAX_UPLOAD_SIZE_BYTES=10737418240  # 10 GB

# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_IMAGE_MODEL=dall-e-3
OPENAI_TRANSCRIPTION_MODEL=whisper-1
AI_REQUEST_TIMEOUT_SECONDS=120

# Hugging Face Configuration (Optional)
HUGGINGFACE_API_KEY=hf_your_token_here
HUGGINGFACE_MODEL=microsoft/DialoGPT-medium
HUGGINGFACE_TEXT_MODEL=microsoft/DialoGPT-medium
HUGGINGFACE_IMAGE_MODEL=stabilityai/stable-diffusion-2-1
HUGGINGFACE_AUDIO_MODEL=openai/whisper-base

# Ollama Configuration (Optional - for local LLMs)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Security Configuration
JWT_SECRET_KEY=change-me-to-a-long-random-string-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Firebase Configuration (for Google OAuth only)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_ID=your-client-id.apps.googleusercontent.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----

# FFmpeg Path (if not in PATH)
# FFMPEG_PATH=/usr/bin/ffmpeg
# FFPROBE_PATH=/usr/bin/ffprobe

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=/var/log/youtube_buddy/backend.log
"""
    
    return template


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Production deployment tools")
    parser.add_argument(
        "command",
        choices=["validate", "env-template"],
        help="Command to run",
    )
    
    args = parser.parse_args()
    
    if args.command == "validate":
        success = validate_production_setup()
        sys.exit(0 if success else 1)
    elif args.command == "env-template":
        print(generate_production_env_template())
