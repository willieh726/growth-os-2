from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ..auth import require_user
from ..db import get_pool
from ..services.pipeline import analyze_and_score

router = APIRouter(prefix="/businesses", tags=["businesses"], dependencies=[Depends(require_user)])


@router.post("/rescore-all")
async def rescore_all(state: str | None = None, limit: int = 500):
    """Re-crawl and re-grade every business (optionally one state).
    Scores are append-only, so this is always safe to run — used after
    scoring-logic changes or to refresh stale grades."""
    pool = await get_pool()
    rows = await pool.fetch(
        """select id from businesses
           where ($1::text is null or state = $1) limit $2""",
        state.upper() if state else None, limit,
    )
    results = {"rescored": 0, "errors": 0}
    for r in rows:
        try:
            await analyze_and_score(str(r["id"]))
            results["rescored"] += 1
        except Exception:
            results["errors"] += 1
    return results


@router.get("")
async def list_businesses(
    state: str | None = None,
    industry: str | None = None,
    min_score: int = 0,
    has_website: bool | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    pool = await get_pool()
    where, args = ["true"], []

    def arg(v):
        args.append(v); return f"${len(args)}"

    if state: where.append(f"state = {arg(state.upper())}")
    if industry: where.append(f"industry = {arg(industry)}::industry")
    if min_score: where.append(f"coalesce(opportunity_score,0) >= {arg(min_score)}")
    if has_website is not None: where.append(f"has_website = {arg(has_website)}")
    if q: where.append(f"name ilike {arg('%' + q + '%')}")
    sql = f"""select id, name, industry, city, state, phone, email, website_url,
                     has_website, gbp_rating, gbp_review_count, opportunity_score,
                     score_breakdown, scored_at
              from businesses_scored where {' and '.join(where)}
              order by opportunity_score desc nulls last
              limit {arg(limit)} offset {arg(offset)}"""
    rows = await pool.fetch(sql, *args)
    count = await pool.fetchval(
        f"select count(*) from businesses_scored where {' and '.join(where[:len(where)])}",
        *args[:-2],
    )
    return {"total": count, "items": [dict(r) for r in rows]}


@router.get("/{business_id}")
async def get_business(business_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("select * from businesses_scored where id=$1", business_id)
    if not row:
        raise HTTPException(404, "not found")
    snapshots = await pool.fetch(
        "select * from website_snapshots where business_id=$1 order by crawled_at desc limit 5",
        business_id,
    )
    return {**dict(row), "snapshots": [dict(s) for s in snapshots]}


@router.post("/{business_id}/rescore")
async def rescore(business_id: str):
    total = await analyze_and_score(business_id)
    return {"business_id": business_id, "opportunity_score": total}
