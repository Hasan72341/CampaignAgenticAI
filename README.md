# 🚀 CampaignX — AI Multi-Agent Campaign Automation

CampaignX is a full-stack AI-powered campaign management platform built for the **CampaignX Hackathon**. It uses a **5-agent LangGraph workflow** with human-in-the-loop approval to profile audiences, plan A/B strategies, generate email content, execute campaigns, analyze metrics, and auto-optimize — all from a single natural-language brief.

---

## 📐 Architecture

```
┌─────────────┐       ┌──────────────────────────┐       ┌───────────────────┐
│   Frontend   │──────▶│       Backend (API)       │──────▶│  PostgreSQL 15    │
│  React/Vite  │◀──────│  FastAPI + LangGraph      │◀──────│  (Docker volume)  │
│  :5173       │       │  :8000                    │       │  :5432            │
└─────────────┘       └──────────────────────────┘       └───────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Ollama LLM      │
                      │  (host machine)  │
                      │  :11434          │
                      └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Hackathon API   │
                      │  (external)      │
                      └──────────────────┘
```

### LangGraph Agent Pipeline

```
START → Profiler → Planner → Generator → [HITL Pause] → Execute → Analyst → Optimizer ──┐
                     ▲                                                                    │
                     └── Reject Handler ◀── (human rejects)                               │
                     └────────────────────── (loop up to 3×) ◀────────────────────────────┘
```

| Agent | Role |
|---|---|
| **Profiler** | Fetches customer cohort from the hackathon API, enriches profiles, assigns segment tags |
| **Planner** | Creates A/B segment strategy with send times and targeting criteria |
| **Generator** | Writes email subject + body for each variant with emoji/URL heuristics and ML predictions |
| **Analyst** | Pulls open/click metrics from `/api/v1/get_report` after campaign send |
| **Optimizer** | Computes weighted scores and produces a `next_strategy` for the next iteration |

---

## 🗂️ Project Structure

```
CampaignAgenticAI/
├── docker-compose.yml          # Orchestrator: db + backend + frontend
├── .env.example                # Sample environment variables
├── test_flow.sh                # End-to-end integration test script
├── render.yaml                 # Render.com backend deployment
├── netlify.toml                # Netlify frontend deployment
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini             # Alembic migration config
│   ├── main.py                 # FastAPI app entry point, CORS, routers
│   ├── api/
│   │   ├── campaigns.py        # POST /generate, GET /status, /metrics, /optimize
│   │   └── approval.py         # POST /approve, /reject (HITL endpoints)
│   ├── agents/
│   │   ├── profiler.py
│   │   ├── planner.py
│   │   ├── generator.py
│   │   ├── analyst.py
│   │   └── optimizer.py
│   ├── workflows/
│   │   ├── langgraph_flow.py   # Full LangGraph state‑machine
│   │   └── state.py            # CampaignState TypedDict
│   ├── tools/
│   │   ├── openapi_tool_factory.py   # Dynamic LangChain tools from OpenAPI spec
│   │   └── campaign_api_tools.py     # Hackathon API tool wrappers
│   └── db/
│       ├── database.py         # SQLAlchemy engine, session, Base
│       ├── models.py           # ORM: Campaign, Segment, Variant, AgentLog, etc.
│       └── migrations/         # Alembic migrations
│           ├── env.py
│           ├── script.py.mako
│           └── versions/
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.jsx             # React Router setup
        ├── pages/
        │   ├── BriefPage.jsx       # Campaign brief input form
        │   ├── ApprovalPage.jsx    # HITL review & approve/reject
        │   └── DashboardPage.jsx   # Real-time metrics dashboard
        ├── components/
        │   ├── VariantCard.jsx
        │   ├── SegmentTable.jsx
        │   ├── MetricsChart.jsx
        │   ├── AIPredictionCard.jsx
        │   ├── AgentStatusBadge.jsx
        │   └── TimelineNode.jsx
        └── services/           # Axios API client
```

---

## ⚡ Quick Start (Docker)

### Prerequisites

| Tool | Version |
|---|---|
| **Docker** & **Docker Compose** | v2+ |
| **Ollama** | Latest (running on your host) |
| **Hackathon API Key** | Obtain from [campaignx.inxiteout.ai](https://campaignx.inxiteout.ai/api/v1/signup) |

### 1. Clone the repository

```bash
git clone https://github.com/Hasan72341/CampaignAgenticAI.git
cd CampaignAgenticAI
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```dotenv
# PostgreSQL (defaults work out of the box)
POSTGRES_USER=campaignx
POSTGRES_PASSWORD=campaignx_secret
POSTGRES_DB=campaignx_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Ollama — must be running on your host machine
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=glm-5:cloud

# Hackathon API
HACKATHON_TEAM_NAME=your_team_name
HACKATHON_TEAM_EMAIL=your_email
HACKATHON_API_KEY=your_api_key
HACKATHON_API_BASE_URL=https://campaignx.inxiteout.ai
```

### 3. Start Ollama (on your host machine)

```bash
ollama run glm-5:cloud
# Or whatever model you configured in OLLAMA_MODEL
```

### 4. Start the full stack

```bash
docker compose up --build
```

This starts **3 containers**:
- **db** — PostgreSQL 15 on port `5432`
- **backend** — FastAPI on port `8000` (runs Alembic migrations on startup)
- **frontend** — React/Vite dev server on port `5173`

### 5. Open the app

| Service | URL |
|---|---|
| **Frontend** | [http://localhost:5173](http://localhost:5173) |
| **API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **Health Check** | [http://localhost:8000/health](http://localhost:8000/health) |

---

## 🧪 Testing

### End-to-End Flow Test

```bash
chmod +x test_flow.sh
./test_flow.sh
```

This script:
1. Creates a campaign via `POST /api/campaigns/generate`
2. Polls `/status` until `pending_approval`
3. Approves the campaign via `POST /api/campaigns/{id}/approve`
4. Waits for `monitoring` or `completed` status
5. Triggers optimization via `POST /api/campaigns/{id}/optimize`

### Manual API Testing

```bash
# Generate a campaign
curl -X POST http://localhost:8000/api/campaigns/generate \
  -H "Content-Type: application/json" \
  -d '{"brief": "Promote our new XDeposit product to high-value customers"}'

# Check status (replace CAMPAIGN_ID)
curl http://localhost:8000/api/campaigns/CAMPAIGN_ID/status

# Approve
curl -X POST http://localhost:8000/api/campaigns/CAMPAIGN_ID/approve

# Reject with feedback
curl -X POST http://localhost:8000/api/campaigns/CAMPAIGN_ID/reject \
  -H "Content-Type: application/json" \
  -d '{"feedback": "Make the tone more professional"}'

# Get live metrics
curl http://localhost:8000/api/campaigns/CAMPAIGN_ID/metrics
```

---

## 🗄️ Database Migrations

Migrations run automatically on container startup via the Dockerfile entrypoint. To run manually:

```bash
# Inside the backend container
docker compose exec backend alembic upgrade head

# Create a new migration after model changes
docker compose exec backend alembic revision --autogenerate -m "describe your changes"
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | DB connectivity check |
| `POST` | `/api/campaigns/generate` | Start a new campaign workflow |
| `GET` | `/api/campaigns/{id}/status` | Full campaign status (segments, variants, logs) |
| `GET` | `/api/campaigns/{id}/metrics` | Live open/click metrics from hackathon API |
| `POST` | `/api/campaigns/{id}/optimize` | Trigger optimization loop |
| `POST` | `/api/campaigns/{id}/approve` | HITL: approve campaign for execution |
| `POST` | `/api/campaigns/{id}/reject` | HITL: reject with optional feedback |

---

## 🌐 Deployment

### Backend → Render

The `render.yaml` blueprint is pre-configured. Set environment variables in the Render dashboard and deploy.

### Frontend → Netlify

The `netlify.toml` is pre-configured. Connect the repo, set `frontend` as the base directory, and deploy.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Framer Motion, Recharts, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| **AI/Agents** | LangGraph, LangChain, Ollama (local LLM) |
| **Database** | PostgreSQL 15 |
| **Infra** | Docker Compose, Render (backend), Netlify (frontend) |

---

## 📄 License

This project was built for the CampaignX Hackathon.
