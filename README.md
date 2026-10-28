# CivicFix — Intelligent Public Grievance Accountability Platform
**Problem ID: HACK-P423**

A premium civic-technology web application that lets citizens submit, track, and escalate public complaints while giving municipal officers, department managers, and administrators a real-time SLA command centre.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 + TypeScript + Tailwind CSS v4 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Charts | Recharts |
| Maps | Leaflet + OpenStreetMap / Nominatim |
| Backend | Python 3.11 + Flask 3 |
| Production DB | Supabase PostgreSQL (via psycopg2) |
| Local Dev DB | SQLite (auto-selected when `DATABASE_URL` is unset) |
| Auth | Token-based (X-Session-Token header) with DB-persisted sessions |
| Frontend host | Vercel |
| Backend host | Render (Gunicorn) |

---

## Local Development — Quick Start

### 1. Clone and set up the backend

```bash
cd civicfix/backend
python -m venv ../venv
# Windows:
..\venv\Scripts\activate
# macOS/Linux:
source ../venv/bin/activate

pip install -r requirements.txt
```

### 2. Seed demo data (first time only)

```bash
python seed_data.py
# To wipe and re-seed:
python seed_data.py --reset
```

### 3. Start the Flask dev server

```bash
python run.py
# → http://127.0.0.1:5000
```

### 4. Start the Vite frontend (separate terminal)

```bash
cd civicfix/frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` requests to `http://localhost:5000` automatically — no `VITE_API_URL` needed locally.

---

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| 🧑 Citizen | `citizen@civicfix.gov` | `CivicFix2026!` |
| 👮 Roads Officer | `officer.roads@civicfix.gov` | `CivicFix2026!` |
| 💧 Water Officer | `officer.water@civicfix.gov` | `CivicFix2026!` |
| 🏢 Roads Manager | `manager.roads@civicfix.gov` | `CivicFix2026!` |
| 🛡️ Administrator | `admin@civicfix.gov` | `CivicFix2026!` |
| 🧑 Generic Citizen | `citizen@civicfix.gov` | `CivicFix2026!` |

> **Note:** Demo accounts use pre-hashed passwords stored in the database — never plain text.

---

## Production Deployment

### Architecture

```
Browser → Vercel (React SPA) → Render (Flask / Gunicorn) → Supabase (PostgreSQL)
```

---

### Step 1 — Supabase PostgreSQL

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Navigate to **Project Settings → Database**.
3. Copy the **Connection string (URI)** in the `postgresql://` format.
4. Keep this — you will paste it as `DATABASE_URL` on Render.

> The application creates all tables automatically on first startup. No manual SQL required.

---

### Step 2 — Render (Backend)

1. Go to [render.com](https://render.com) → **New → Web Service**.
2. Connect your GitHub repository.
3. Configure:
   - **Root Directory:** `backend`
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120 --log-level info`
   - **Health Check Path:** `/api/health`

4. Set these **Environment Variables** in the Render dashboard:

| Variable | Value |
|----------|-------|
| `SECRET_KEY` | A long random string (click "Generate" in Render) |
| `DATABASE_URL` | Your Supabase connection string (`postgresql://...`) |
| `ALLOWED_ORIGIN` | Your Vercel frontend URL e.g. `https://civicfix.vercel.app` |
| `FLASK_ENV` | `production` |

5. Deploy. Render will install dependencies and start Gunicorn.
6. Note the Render service URL, e.g. `https://civicfix-api.onrender.com`.

> **Free tier note:** Render free services spin down after 15 min of inactivity. Use the paid Starter plan for hackathon demos to avoid cold starts.

---

### Step 3 — Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **New Project → Import Git Repository**.
2. Select your repository.
3. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. Set this **Environment Variable** in Vercel:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Render backend URL e.g. `https://civicfix-api.onrender.com` |

5. Deploy.
6. Go back to **Render → civicfix-api → Environment** and update `ALLOWED_ORIGIN` to the Vercel deployment URL.
7. Redeploy the Render service so the new CORS origin takes effect.

---

### Step 4 — Seed demo data on production (once)

After the Render backend is live, open the Render **Shell** tab and run:

```bash
python seed_data.py
```

This only seeds if the database is empty — it will not overwrite existing data.

---

## Environment Variables Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | Flask session secret — generate a 32-byte hex string |
| `DATABASE_URL` | ✅ | PostgreSQL connection string from Supabase |
| `ALLOWED_ORIGIN` | ✅ | Exact Vercel frontend URL (no trailing slash) |
| `FLASK_ENV` | — | Set to `production` |
| `PORT` | — | Set automatically by Render |
| `UPLOAD_FOLDER` | — | Override upload directory (optional) |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Render backend base URL e.g. `https://civicfix-api.onrender.com` |

> ⚠️ `VITE_` variables are bundled into the browser JS. Never put secrets here.

---

## Useful Commands

```bash
# Local dev reset (wipe all data and re-seed)
cd backend && python seed_data.py --reset

# Run all backend tests
cd backend && pytest tests/ -v

# Production build check
cd frontend && npm run build

# TypeScript type check
cd frontend && npx tsc --noEmit

# Start production server locally (mimics Render)
cd backend && gunicorn wsgi:app --bind 0.0.0.0:5000 --workers 2
```

---

## Security Notes

- Roles are enforced server-side. Sending a different role from the browser has no effect.
- Sessions are stored in the database — they survive server restarts.
- All SQL queries use parameterized statements — no SQL injection vectors.
- CORS is restricted to the configured `ALLOWED_ORIGIN` — no wildcard.
- `SECRET_KEY` must be set in production; a random key is generated as a fallback but sessions won't survive restarts.
- Database credentials are never exposed to the frontend.
- Password hashes use Werkzeug's `generate_password_hash` (PBKDF2-HMAC-SHA256).

---

## Known Limitations

- File uploads (evidence photos) are stored on the local filesystem. On Render's free tier, the filesystem is ephemeral — files uploaded in production will be lost on restart. For production file storage, integrate Cloudinary or Supabase Storage and update `grievance_routes.py`.
- The Render free tier has cold-start delays (~30s). Use the Starter plan for a hackathon demo.
- Browser Geolocation requires HTTPS — it works on Vercel (always HTTPS) and locally on `localhost` (exempt).
- Nominatim reverse geocoding is rate-limited to 1 request/second per their policy — suitable for a demo but not high traffic.
