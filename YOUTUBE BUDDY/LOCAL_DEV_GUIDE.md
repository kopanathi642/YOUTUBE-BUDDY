# YouTube Buddy - Local Development Guide

## Quick Start

This guide shows how to run YouTube Buddy as a fully local development environment without Firebase or cloud dependencies.

### Prerequisites
- Python 3.12+
- Node.js 18+
- Git

### Setup & Installation

#### 1. Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Verify import works
python -c "import app.main; print('Backend ready')"
```

#### 2. Frontend Setup

```bash
cd FRONTEND

# Install Node dependencies
npm install

# Verify Next.js is configured
npm run build
```

---

## Running Local Development

### Terminal 1: Start Backend API

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete
```

The backend will:
- Initialize local SQLite database (`dev.db`) automatically
- Start FastAPI with hot reload enabled
- Provide Swagger UI at `http://localhost:8000/docs`
- Accept API requests at `http://localhost:8000/api/v1/*`

### Terminal 2: Start Frontend Dev Server

```bash
cd FRONTEND
npm run dev
```

**Expected Output:**
```
✓ Ready in X.Xs
- Local:        http://localhost:3000
```

The frontend will:
- Load environment from `.env.local`
- Connect to backend API at `http://localhost:8000`
- Support hot reload for React/Next.js development
- Use local auth (no Firebase required)

---

## Local Authentication Flow

### How It Works

1. **Frontend** (`FRONTEND/.env.local`):
   - All Firebase config vars are empty (local mode)
   - Backend API URL points to `http://localhost:8000`
   - AuthContext uses local token-based auth

2. **Backend** (`backend/.env`):
   - `STORAGE_PROVIDER=local` → Uploads saved to `uploads/` directory
   - `DATABASE_URL=sqlite+aiosqlite:///./dev.db` → Local SQLite database
   - `JWT_SECRET=local_dev_secret_key` → Local token signing
   - Auth endpoints: `/api/v1/auth/signup`, `/api/v1/auth/login`, `/api/v1/auth/profile`

### Demo Login

Use the built-in demo token without a backend account:

```bash
# Frontend will accept this demo token automatically
curl -H "Authorization: Bearer demo-token" http://localhost:8000/api/v1/auth/profile
```

Or sign up a local user:

```bash
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@local.dev", "password": "testpass123", "username": "testuser"}'
```

---

## Database

### Local SQLite

The backend automatically creates a SQLite database at `backend/dev.db` on first run.

**To reset the database:**

```bash
# Delete the database file
rm backend/dev.db

# On next backend start, a fresh database will be created
```

### Database Migrations

If you add new models, update `backend/app/models/` and the database will auto-reflect on backend restart.

---

## File Uploads

Uploaded files are stored locally in the `backend/uploads/` directory.

**To clear uploads:**

```bash
rm -rf backend/uploads/*
```

---

## API Reference

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | Create a new user |
| POST | `/api/v1/auth/login` | Login and get JWT token |
| GET | `/api/v1/auth/profile` | Get current user profile (requires auth) |
| POST | `/api/v1/uploads/video` | Upload a video file |
| GET | `/api/v1/videos` | List user's videos |

**View all endpoints:**

Open `http://localhost:8000/docs` (Swagger UI)

---

## Troubleshooting

### Backend won't start

```bash
# Check Python version
python --version  # Should be 3.12+

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Check if port 8000 is in use
netstat -ano | findstr :8000  # On Windows
```

### Frontend won't build

```bash
# Clear Next.js cache
rm -rf FRONTEND/.next

# Reinstall Node modules
cd FRONTEND
rm -rf node_modules
npm install
npm run dev
```

### Backend import errors

```bash
# Verify all dependencies installed
python -m pip list | grep -E "sqlalchemy|pydantic|fastapi|aiosqlite"

# Try reimporting
python -c "import app.main; print('OK')"
```

### Database locked errors

The SQLite database may be locked if backend is still running. Kill the backend process and restart.

---

## Environment Variables

### Backend (`backend/.env`)

```env
ENVIRONMENT=development
DEBUG=True
DATABASE_URL=sqlite+aiosqlite:///./dev.db
STORAGE_PROVIDER=local
JWT_SECRET=local_dev_secret_key
UPLOAD_DIR=uploads
```

### Frontend (`FRONTEND/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_FIREBASE_API_KEY=          # Leave blank for local dev
```

---

## Project Structure

```
.
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── services/       # Business logic
│   │   └── core/           # Config, security, database
│   ├── dev.db              # Local SQLite database (auto-created)
│   └── .env                # Backend environment config
│
├── FRONTEND/               # Next.js frontend
│   ├── src/
│   │   ├── app/           # Pages and layout
│   │   ├── components/    # React components
│   │   ├── context/       # Auth and query providers
│   │   └── lib/           # API client, utilities
│   ├── .env.local         # Frontend environment config
│   └── package.json
│
└── LOCAL_DEV_GUIDE.md      # This file
```

---

## Next Steps

1. **Sign up** a local user at `http://localhost:3000/signup`
2. **Login** with credentials at `http://localhost:3000/login`
3. **Upload** a test video through the dashboard
4. **Monitor** backend activity in the Swagger UI at `http://localhost:8000/docs`

---

## Support

For issues:
1. Check the backend logs in terminal 1
2. Check the frontend console (F12 in browser)
3. Review API responses in the Swagger UI at `http://localhost:8000/docs`
