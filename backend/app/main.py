import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_pool, get_pool
from .routers import audits, businesses, ingestion, leads, outreach, stats, webhooks

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title="Growth OS API", version="0.1.0", lifespan=lifespan)

# CORS. A wrong/missing FRONTEND_URL used to break every browser request with
# an opaque "Failed to fetch" and no server-side log, so the production
# dashboard and Vercel preview deploys are allowed explicitly rather than
# depending on an env var being set correctly.
_front = (get_settings().frontend_url or "").rstrip("/")
_origins = [o for o in {
    _front,
    "https://growth-os-2-uwis.vercel.app",
    "http://localhost:3000",
} if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Vercel gives every deploy a unique preview URL; without this, any
    # non-production deploy is blocked.
    allow_origin_regex=r"https://growth-os-2.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (ingestion.router, businesses.router, leads.router,
          audits.router, outreach.router, webhooks.router, stats.router):
    app.include_router(r)


@app.get("/health")
async def health():
    pool = await get_pool()
    await pool.fetchval("select 1")
    return {"ok": True}
