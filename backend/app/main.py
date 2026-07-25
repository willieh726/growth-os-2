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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_url],
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
