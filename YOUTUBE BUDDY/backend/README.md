# YouTube Buddy Backend

Production-grade AI creator platform backend built with FastAPI, Python, FFmpeg, Firebase, PostgreSQL, OpenAI, and Celery.

## Overview

YouTube Buddy is a startup-ready AI automation platform that transforms long-form videos into short-form content. The backend provides:

- **Video Processing**: FFmpeg-powered video transcoding, clip extraction, and rendering
- **AI Transcription**: Whisper AI integration for accurate speech-to-text
- **Viral Clip Detection**: OpenAI-powered analysis for engagement scoring
- **Shorts Generation**: Automated conversion to multiple aspect ratios (9:16, 16:9, 1:1, 4:5)
- **Caption Generation**: Multi-format subtitle support (SRT, ASS, WebVTT)
- **AI Agents**: Trend, Script, SEO, Shorts, and Upload automation agents
- **Social Upload**: YouTube, Instagram, TikTok publishing integration
- **Background Jobs**: Celery + Redis task queue for async processing
- **Cloud Storage**: Firebase Storage integration
- **Database**: PostgreSQL with SQLAlchemy ORM

## Tech Stack

- **Framework**: FastAPI + Uvicorn
- **Language**: Python 3.12
- **Database**: PostgreSQL + SQLAlchemy
- **Cache/Queue**: Redis + Celery
- **Video**: FFmpeg
- **AI/ML**: OpenAI API, Whisper
- **Auth**: Firebase Authentication
- **Cloud**: Firebase Storage
- **Containerization**: Docker + Docker Compose

## Project Structure

```
backend/
├── app/
│   ├── api/v1/
│   │   ├── auth.py          # Firebase authentication endpoints
│   │   ├── uploads.py       # Video upload management
│   │   ├── videos.py        # Video transcription and analysis
│   │   ├── shorts.py        # Short clip generation
│   │   ├── captions.py      # Caption generation
│   │   ├── agents.py        # AI agent execution
│   │   └── social.py        # Social media upload scheduling
│   ├── core/
│   │   ├── config.py        # App configuration
│   │   ├── database.py      # PostgreSQL setup
│   │   ├── firebase.py      # Firebase integration
│   │   ├── security.py      # JWT and authentication
│   │   ├── celery_app.py    # Celery configuration
│   │   └── logging.py       # Logging setup
│   ├── models/
│   │   ├── user.py          # User model
│   │   ├── project.py       # Project model
│   │   ├── upload.py        # Upload model
│   │   ├── short.py         # Short video model
│   │   ├── caption.py       # Caption model
│   │   ├── render_job.py    # Render job tracking
│   │   ├── ai_generation.py # AI generation history
│   │   └── subscription.py  # Subscription model
│   ├── schemas/
│   │   ├── user.py          # User request/response schemas
│   │   ├── upload.py        # Upload schemas
│   │   ├── video.py         # Video schemas
│   │   ├── short.py         # Short schemas
│   │   ├── caption.py       # Caption schemas
│   │   ├── render_job.py    # Render job schemas
│   │   ├── ai_generation.py # AI generation schemas
│   │   └── auth.py          # Auth schemas
│   ├── services/
│   │   ├── auth.py          # User authentication logic
│   │   ├── storage.py       # Cloud storage operations
│   │   ├── transcription.py # Whisper transcription
│   │   ├── video_processing.py # FFmpeg operations
│   │   ├── ai_generation.py # AI generation workflows
│   │   ├── agent_manager.py # AI agent orchestration
│   │   └── social_upload.py # Social media operations
│   ├── workers/
│   │   └── celery_tasks.py  # Background job definitions
│   ├── utils/
│   │   ├── ffmpeg.py        # FFmpeg utility functions
│   │   ├── openai_client.py # OpenAI client wrapper
│   │   ├── whisper.py       # Whisper transcription wrapper
│   │   └── validators.py    # Request validators
│   └── main.py              # FastAPI app setup
├── Dockerfile               # Docker image definition
├── docker-compose.yml       # Multi-container setup
├── requirements.txt         # Python dependencies
├── setup.sh                 # Unix setup script
├── setup.bat                # Windows setup script
└── README.md                # This file
```

## Prerequisites

- Python 3.12+
- Docker and Docker Compose (optional but recommended)
- FFmpeg
- PostgreSQL (via Docker or local)
- Redis (via Docker or local)

## Installation

### Option 1: Docker Compose (Recommended)

```bash
cd backend
cp .env.example .env
# Edit .env with your Firebase and OpenAI credentials
docker-compose up -d
```

This starts:
- FastAPI backend (port 8000)
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- Celery worker for background tasks

### Option 2: Manual Setup (macOS/Linux)

```bash
cd backend
bash setup.sh
source venv/bin/activate
export $(cat .env | xargs)
uvicorn app.main:app --reload --port 8000
```

### Option 3: Manual Setup (Windows)

```cmd
cd backend
setup.bat
venv\Scripts\activate.bat
set /p ENV_FILE=<.env
uvicorn app.main:app --reload --port 8000
```

## Configuration

Create a `.env` file from `.env.example` and populate:

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@db:5432/youtube_buddy
REDIS_URL=redis://redis:6379/0
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
OPENAI_API_KEY=sk-...
JWT_SECRET_KEY=your-secret-key
```

## Running the Backend

### Development

```bash
uvicorn app.main:app --reload
```

### Production

```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Background Workers

Start Celery worker for video processing:

```bash
celery -A app.core.celery_app.celery_app worker --loglevel=info
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/firebase-login` - Google/Firebase login
- `GET /api/v1/auth/profile` - Get user profile

### Uploads
- `POST /api/v1/uploads/upload` - Upload video
- `GET /api/v1/uploads/list` - List user uploads

### Videos
- `POST /api/v1/videos/transcribe` - Transcribe video audio
- `POST /api/v1/videos/analyze` - Analyze for viral clips

### Shorts
- `POST /api/v1/shorts/generate` - Generate short clips
- `GET /api/v1/shorts/list/{upload_id}` - List shorts

### Captions
- `POST /api/v1/captions/generate` - Generate captions
- `GET /api/v1/captions/list/{upload_id}` - List captions

### AI Agents
- `POST /api/v1/agents/run` - Run AI agent
- `GET /api/v1/agents/history` - Get agent history

### Social Upload
- `POST /api/v1/social/prepare` - Prepare social post
- `POST /api/v1/social/schedule` - Schedule upload

## Database Migrations

Initialize database:

```bash
python -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
```

## Deployment

### Vercel (Frontend)

```bash
cd frontend
vercel deploy
```

### Railway/Render (Backend)

```bash
# Push to GitHub repo
# Connect to Railway/Render
# Set environment variables
# Deploy
```

### Docker Hub Registry

```bash
docker build -t youtube-buddy-backend .
docker tag youtube-buddy-backend your-registry/youtube-buddy-backend:1.0.0
docker push your-registry/youtube-buddy-backend:1.0.0
```

## Development

### Code Quality

```bash
# Linting
pylint app/

# Type checking
mypy app/

# Formatting
black app/
```

### Testing

```bash
pytest tests/ -v
```

## Troubleshooting

### Port Already in Use

```bash
# macOS/Linux
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### FFmpeg Not Found

Install FFmpeg:
- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt-get install ffmpeg`
- **Windows**: Download from https://ffmpeg.org/download.html

### Database Connection Error

Check PostgreSQL is running:

```bash
# Docker
docker-compose ps

# Local PostgreSQL
psql -U postgres -h localhost
```

## Support

For issues and feature requests, open a GitHub issue or contact the team.

---

**YouTube Buddy** - AI-Powered Creator Tools | 2026
