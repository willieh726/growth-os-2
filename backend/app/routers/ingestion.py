from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from ..auth import require_user_or_internal
from ..db import get_pool
from ..services.adapters.csv_adapter import CSVAdapter
from ..services.adapters.google_places import GooglePlacesAdapter
from ..services.geo import STATE_CITIES
from ..services.pipeline import run_ingestion

router = APIRouter(prefix="/ingestion", tags=["ingestion"],
                   dependencies=[Depends(require_user_or_internal)])


class StartRun(BaseModel):
    industry: str
    state: str = "CT"
    cities: list[str] | None = None   # default: full state list from geo.py


@router.post("/runs")
async def start_run(body: StartRun, bg: BackgroundTasks):
    state = body.state.upper()
    if state not in STATE_CITIES:
        raise HTTPException(400, f"Unsupported state {state}")
    cities = body.cities or STATE_CITIES[state]
    pool = await get_pool()
    row = await pool.fetchrow(
        """insert into ingestion_runs (source, industry, state, cities)
           values ('google_places', $1, $2, $3) returning id""",
        body.industry, state, cities,
    )
    run_id = str(row["id"])
    bg.add_task(run_ingestion, run_id, GooglePlacesAdapter(), body.industry, state, cities)
    return {"run_id": run_id, "cities": len(cities), "status": "queued"}


@router.post("/runs/csv")
async def start_csv_run(industry: str, state: str, file: UploadFile, bg: BackgroundTasks):
    text = (await file.read()).decode("utf-8", errors="replace")
    pool = await get_pool()
    row = await pool.fetchrow(
        """insert into ingestion_runs (source, industry, state, cities)
           values ('csv_registry', $1, $2, '{}') returning id""",
        industry, state.upper(),
    )
    run_id = str(row["id"])
    bg.add_task(run_ingestion, run_id, CSVAdapter(text), industry, state.upper(), [])
    return {"run_id": run_id, "status": "queued"}


@router.get("/runs")
async def list_runs(limit: int = 20):
    pool = await get_pool()
    rows = await pool.fetch(
        "select * from ingestion_runs order by created_at desc limit $1", limit
    )
    return [dict(r) for r in rows]


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("select * from ingestion_runs where id=$1", run_id)
    if not row:
        raise HTTPException(404, "run not found")
    return dict(row)
