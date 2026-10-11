## YouTube Buddy — README

# YouTube Buddy 🚀

**The most advanced AI creator platform for YouTube automation and growth.**

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| Animation | Framer Motion |
| 3D | Three.js + React Three Fiber + Drei |
| Auth | Firebase Auth (Google + Email) |
| Storage | Firebase Storage |
| Database | Firebase Firestore + PostgreSQL |
| API | Axios + React Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| State | Zustand |

---

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd "YOUTUBE BUDDY/FRONTEND"
npm install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Google and Email/Password
4. Enable **Firestore Database**
5. Enable **Storage**
6. Copy your config values to `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Configure Backend API

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth group (login, signup, forgot-password)
│   ├── dashboard/         # Main dashboard
│   ├── studio/
│   │   ├── shorts/        # AI Shorts Studio
│   │   └── cinematic/     # Cinematic AI Studio
│   ├── agents/            # AI Agent Automation
│   ├── pricing/           # Pricing page
│   ├── profile/           # User profile & settings
│   └── page.tsx           # Homepage
├── components/
│   ├── ui/                # Reusable UI primitives
│   ├── layout/            # Navbar, Sidebar, Footer
│   ├── three/             # Three.js 3D scenes
│   ├── home/              # Homepage sections
│   ├── dashboard/         # Dashboard widgets
│   ├── studio/            # Studio components
│   └── auth/              # Auth utilities
├── context/               # React contexts
├── hooks/                 # Custom React hooks
├── lib/                   # Firebase, API client, utilities
└── types/                 # TypeScript definitions
```

---

## 🔌 Backend Integration

This frontend is designed to connect with a **FastAPI** backend at `NEXT_PUBLIC_API_URL`.

Expected endpoints:
- `POST /api/v1/videos/upload` — Upload video with progress
- `GET /api/v1/transcription/{videoId}` — Get transcript
- `POST /api/v1/shorts/generate` — Generate shorts
- `POST /api/v1/viral-moments/detect` — Detect viral moments
- `POST /api/v1/cinematic/generate` — Generate cinematic scene
- `POST /api/v1/agents/{id}/trigger` — Trigger AI agent
- `GET /api/v1/analytics/overview` — Channel analytics

All requests include Firebase Auth Bearer token automatically.

---

## 🌐 Deployment

### Frontend (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Environment Variables for Production

Set these in your Vercel dashboard:
- All `NEXT_PUBLIC_FIREBASE_*` values
- `NEXT_PUBLIC_API_URL` (your Railway/Render backend URL)
- `NEXT_PUBLIC_APP_URL` (your Vercel URL)

---

## 📦 Pages

| Route | Page |
|-------|------|
| `/` | Homepage with 3D hero |
| `/login` | Firebase login |
| `/signup` | Firebase signup |
| `/forgot-password` | Password reset |
| `/dashboard` | Creator dashboard |
| `/studio/shorts` | AI Shorts Studio |
| `/studio/cinematic` | Cinematic AI Studio |
| `/agents` | AI Agent Automation |
| `/pricing` | Pricing plans |
| `/profile` | User settings |
