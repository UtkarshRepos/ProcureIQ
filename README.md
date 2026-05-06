# ⚡ ProcureAI — Industrial Intelligence Platform

> AI-powered procurement document analysis for **Delta Controls FZCO** & **Veetech Automation**  
> Built with: Node.js · Express · Google Gemini · n8n · Vanilla JS

---

## 🏗️ Architecture (Production-Grade)

```
┌─────────────────────┐     HTTP Requests     ┌──────────────────────────┐
│   Frontend Browser  │ ────────────────────► │   Node.js Backend        │
│   frontend/         │                        │   :3001                  │
│   (No API keys!)    │ ◄────────────────────  │   ✓ API key secured here │
└─────────────────────┘     JSON responses     │   ✓ Rate limiting        │
                                               │   ✓ Request logging      │
                                               └───────────┬──────────────┘
                                                           │ Gemini API calls
                                                           ▼
                                               ┌──────────────────────────┐
                                               │   Google Gemini AI       │
                                               │   gemini-2.0-flash       │
                                               └──────────────────────────┘
                                                           ▲
┌─────────────────────┐    Webhook POST        ┌──────────────────────────┐
│   Gmail Inbox       │ ──────────────────────►│   /api/webhook/          │
│   (PDF received)    │                        │   email-document         │
└─────────────────────┘                        └──────────────────────────┘
          ▲                                                │
          │            AI Reply Email                      │
          └────────────────────────────────────────────────┘
                         (via n8n)
```

---

## 🚀 Quick Start

### Step 1 — Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:
```env
GEMINI_API_KEY=your_gemini_key_here    # Get free at aistudio.google.com
PORT=3001
FRONTEND_URL=http://localhost:5500
COMPANY_NAME=Delta Controls FZCO
```

### Step 3 — Start Backend

```bash
npm run dev
# You should see: ProcureAI Backend Started on port 3001
```

### Step 4 — Open Frontend

Open `frontend/index.html` in a browser using Live Server (VS Code extension)  
or any static file server on port 5500.

> **Why Live Server?** CORS is configured for `localhost:5500`. You can change `FRONTEND_URL` in `.env` to match your setup.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| POST | `/api/analyze-document` | Upload PDF/TXT for AI analysis |
| POST | `/api/analyze-text` | Analyze pasted text |
| POST | `/api/compare-quotes` | Compare supplier quotes |
| POST | `/api/screen-cv` | Screen candidate CV against JD |
| POST | `/api/chat` | Multi-turn AI chat with document context |
| POST | `/api/webhook/email-document` | **n8n webhook** — Email PDF auto-processing |
| GET | `/api/webhook/health` | Webhook health check |

---

## 🔄 n8n Automation Workflow

### What it does
```
New Email with PDF → Extract Text → ProcureAI Backend → Gemini Analysis → Reply Email
```

### Setup Instructions

1. **Install n8n** (free, self-hosted):
   ```bash
   npx n8n
   # Opens at http://localhost:5678
   ```

2. **Import workflow**:
   - Open n8n → Workflows → Import
   - Select `n8n-workflows/email-pdf-analysis.json`

3. **Configure Gmail credentials** in n8n:
   - Settings → Credentials → Add → Gmail OAuth2

4. **Start your ProcureAI backend** (must be running on `:3001`)

5. **Activate the workflow** — n8n will now watch your inbox 24/7

### Flow Diagram
```
📧 New Email arrives
    │
    ▼
🔍 Has PDF attachment?
    │
    ├── NO  → ⏭ Skip
    │
    └── YES → 📄 Extract PDF text
                │
                ▼
              🤖 POST to localhost:3001/api/webhook/email-document
                │
                ▼
              ✅ Success?
                │
                ├── NO  → ⚠ Log Error
                │
                └── YES → 📤 Send AI reply to original sender
                              │
                              ▼
                            📝 Log success
```

---

## 🔒 Security Design

| Concern | How We Handle It |
|---------|-----------------|
| API Key exposure | Key only in backend `.env` — never sent to browser |
| Rate limiting | 100 requests per 15 min per IP (`express-rate-limit`) |
| Input validation | All routes validate request body before AI call |
| Error handling | Centralized error handler — no stack traces in prod |
| CORS | Restricted to `FRONTEND_URL` only |
| Helmet | Security headers on all responses |
| File size | 10MB max upload limit |
| File type | Only PDF and TXT accepted |

---

## 📋 Project Structure

```
procureai/
│
├── backend/                    # Node.js Express server
│   ├── server.js               # Main server — security, routes, middleware
│   ├── package.json
│   ├── .env.example            # Copy to .env and fill in keys
│   ├── logs/                   # Auto-created — Winston logs
│   │
│   ├── services/
│   │   ├── gemini.js           # All Gemini AI calls — centralized
│   │   └── logger.js           # Winston logging setup
│   │
│   ├── middleware/
│   │   ├── requestLogger.js    # Logs every request with timing
│   │   └── errorHandler.js     # Centralized error handling
│   │
│   └── routes/
│       ├── analyze.js          # /api/analyze-document, /api/analyze-text
│       ├── compare.js          # /api/compare-quotes
│       ├── hr.js               # /api/screen-cv
│       ├── chat.js             # /api/chat
│       └── webhook.js          # /api/webhook/email-document (n8n)
│
├── frontend/
│   └── index.html              # Full SPA — calls backend, no API keys
│
├── n8n-workflows/
│   └── email-pdf-analysis.json # Import this into n8n
│
└── README.md
```

---

## 🎯 Features

### 📄 Document Analysis
- Upload PDF or paste text
- AI extracts: vendor, buyer, value, delivery, payment terms, warranty
- Risk flagging: High / Medium / Low with explanations
- Oil & Gas context-aware recommendations

### ⚖ Quote Comparison
- Compare up to 10 supplier quotes
- AI scores: price, delivery, warranty, overall value
- Winner recommendation with justification

### 💬 AI Chat Assistant
- Multi-turn conversation
- Full document context injected automatically
- Ask questions in plain English

### 👤 CV Screener
- Evaluate candidates against job descriptions
- Skills alignment scoring
- Strengths, gaps, interview questions

### 🔄 n8n Email Automation
- Watches Gmail inbox
- Auto-processes PDF attachments
- Sends AI summary reply to sender

---

## 💰 Cost

| Item | Cost |
|------|------|
| Google Gemini API | **Free** (1500 req/day) |
| n8n (self-hosted) | **Free** |
| Node.js backend | **Free** (localhost) |
| Frontend hosting | **Free** (GitHub Pages / Netlify) |

---

## 🚢 Deploy to Production (Optional)

1. **Backend**: Push to [Railway](https://railway.app) or [Render](https://render.com) — free tier available
2. **Frontend**: Push to [Netlify](https://netlify.com) — free tier, drag & drop `frontend/`
3. **n8n**: Use [n8n Cloud](https://n8n.io) — free trial, or keep self-hosted

---

*Built for Delta Controls FZCO & Veetech Automation · UAE · 2026*
