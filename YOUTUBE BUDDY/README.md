# YouTube Buddy - Complete Setup Guide

## Project Structure

```
YOUTUBE BUDDY/
├── FRONTEND/              # Next.js frontend application
│   ├── src/
│   ├── package.json
│   ├── setup.bat
│   └── README.md
├── backend/               # FastAPI backend application
│   ├── app/              # Main application code
│   ├── requirements.txt   # Python dependencies
│   ├── Dockerfile
│   ├── setup.sh
│   ├── setup.bat
│   └── README.md
├── docker-compose.yml    # Multi-container orchestration
└── .env.example          # Environment variables template
```

## Quick Start

### 1. Set Up Environment

Copy `.env.example` to `.env` and fill in credentials:

```bash
cp .env.example .env
```

Edit `.env` with:
- Firebase credentials
- OpenAI API key
- Database configuration
- JWT secret

### 2. Start Backend Services

#### Option A: Docker Compose (Recommended)

```bash
docker-compose up -d
```

This starts:
- Backend API (localhost:8000)
- PostgreSQL database
- Redis cache
- Celery worker

#### Option B: Manual Setup

**Windows:**
```bash
cd backend
setup.bat
venv\Scripts\activate.bat
uvicorn app.main:app --reload
```

**macOS/Linux:**
```bash
cd backend
bash setup.sh
source venv/bin/activate
uvicorn app.main:app --reload
```

### 3. Start Frontend

```bash
cd FRONTEND
npm install
npm run dev
```

Frontend runs on localhost:3000

### 4. Verify Setup

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/api/v1/docs
- **Database**: postgresql://localhost:5432

## Key Features Implemented

✅ **Authentication**
- Firebase Google login integration
- JWT token verification
- Protected API routes

✅ **Video Upload System**
- Large file upload support
- Firebase Storage integration
- Progress tracking

✅ **FFmpeg Processing**
- Video transcoding
- Clip extraction
- Aspect ratio conversion
- Thumbnail generation

✅ **AI Transcription**
- Whisper AI speech-to-text
- Timestamp extraction
- Multi-language support

✅ **Viral Clip Detection**
- OpenAI-powered analysis
- Engagement scoring
- Hook detection

✅ **Shorts Generation**
- Multi-ratio support (9:16, 16:9, 1:1, 4:5)
- Async rendering with Celery
- Export system

✅ **Caption System**
- Multi-format support (SRT, ASS, WebVTT)
- Subtitle overlay
- Styling options

✅ **AI Automation Agents**
- Trend analysis agent
- Script generation agent
- SEO optimization agent
- Shorts creation agent
- Upload scheduling agent

✅ **Social Media Integration**
- YouTube API ready
- Instagram Graph API ready
- TikTok upload ready
- Auto-publishing support

✅ **Background Jobs**
- Celery task queue
- Redis caching
- Job monitoring
- Retry handling

✅ **Cloud Infrastructure**
- Docker containerization
- Multi-service orchestration
- Environment-based configuration
- Production-ready deployment

## File Structure Overview

### Frontend (`FRONTEND/`)

- **pages**: Home, Auth, Dashboard, Studio
- **components**: Reusable React components
- **services**: API integration layer
- **types**: TypeScript type definitions
- **hooks**: Custom React hooks

### Backend (`backend/`)

- **api**: REST API endpoints (v1)
- **models**: SQLAlchemy database models
- **schemas**: Pydantic request/response models
- **services**: Business logic layer
- **workers**: Celery background tasks
- **utils**: Helper functions and integrations
- **core**: Configuration and core functionality

## Authentication Flow

1. User clicks "Sign in with Google" on frontend
2. Firebase handles OAuth via Google
3. Frontend receives ID token
4. Frontend sends token to `/api/v1/auth/firebase-login`
5. Backend verifies token with Firebase
6. User record created if new
7. Session established with JWT

## Video Processing Flow

1. User uploads video to `/api/v1/uploads/upload`
2. Video stored in Firebase Storage
3. User triggers transcription: `/api/v1/videos/transcribe`
4. Celery worker extracts audio and runs Whisper AI
5. Transcript returned with timestamps
6. User analyzes for clips: `/api/v1/videos/analyze`
7. OpenAI generates clip timestamps and titles
8. User generates shorts: `/api/v1/shorts/generate`
9. Celery workers render clips at target ratios
10. Captions generated: `/api/v1/captions/generate`
11. Final videos ready for export and social upload

## API Documentation

After starting the backend, visit: **http://localhost:8000/api/v1/docs**

Full interactive Swagger API documentation with try-it-out functionality.

## Deployment

### Frontend (Vercel)

```bash
cd FRONTEND
vercel deploy
```

### Backend (Railway/Render)

1. Push code to GitHub
2. Connect repository to Railway/Render
3. Set environment variables
4. Deploy

### Docker Registry

```bash
docker build -t youtube-buddy-backend ./backend
docker tag youtube-buddy-backend <registry>/youtube-buddy-backend:1.0.0
docker push <registry>/youtube-buddy-backend:1.0.0
```

## Common Issues

**Port 8000 already in use:**
```bash
# Find and kill process
lsof -i :8000
kill -9 <PID>
```

**FFmpeg not found:**
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

**Database connection error:**
```bash
# Check Docker containers
docker-compose ps

# View logs
docker-compose logs db
```

## Next Steps

1. Configure Firebase project credentials in `.env`
2. Add OpenAI API key to `.env`
3. Set up social media API credentials
4. Configure payment processing (Stripe/Paddle)
5. Deploy to production environments
6. Set up CI/CD pipelines
7. Configure monitoring and logging

---

**YouTube Buddy** - Production-Grade AI Creator Platform
