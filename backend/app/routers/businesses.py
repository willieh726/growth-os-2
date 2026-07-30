from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ..auth import require_user_or_internal
from ..db import get_pool
from ..services.pipeline import analyze_and_score
from ..services.website_finder import find_website

router = APIRouter(prefix="/businesses", tags=["businesses"],
                   dependencies=[Depends(require_user_or_internal)])


@router.post("/discover-websites")
async def discover_websites(bg: BackgroundTasks, limit: int = 90):
    """For businesses flagged 'no website', search the web for an unlinked
    site. Found ones get re-classified + re-scored with the honest signal
    'website exists but not linked on their Google profile'. Limit defaults
    to 90/run — the search API's free tier is 100 queries/day."""
    pool = await get_pool()
    rows = await pool.fetch(
        """select id, name, city, state from businesses
           where has_website = false and website_checked_at is null
           order by first_seen_at limit $1""", limit,
    )
    targets = [dict(r) for r in rows]

    async def _run() -> None:
        import asyncio
        import logging
        log = logging.getLogger("discovery")
        found = 0
        for t in targets:
            await asyncio.sleep(1.1)  # Brave free tier: max 1 request/second
            try:
                url = await find_website(t["name"], t["city"], t["state"])
                if url:
                    await pool.execute(
                        """update businesses
                           set website_url=$2, has_website=true, website_discovered=true
                           where id=$1""", t["id"], url,
                    )
                    await analyze_and_score(str(t["id"]))
                    found += 1
            except Exception:
                log.exception("discovery failed for %s", t["name"])
            finally:
                # Mark attempted no matter the outcome — this is what makes
                # each batch advance instead of re-checking the same businesses.
                await pool.execute(
                    "update businesses set website_checked_at = now() where id=$1",
                    t["id"],
                )
        log.info("website discovery pass done: %s/%s found", found, len(targets))

    bg.add_task(_run)
    return {"queued": len(targets), "note": "runs in background; check scores in ~10 min"}


@router.post("/rescore-all")
async def rescore_all(bg: BackgroundTasks, state: str | None = None, limit: int = 5000):
    """Queue a re-crawl + re-grade of every business (optionally one state).
    Runs in the background — at thousands of businesses a synchronous loop
    would time out the request. Scores are append-only, always safe."""
    pool = await get_pool()
    rows = await pool.fetch(
        """select id from businesses
           where ($1::text is null or state = $1) limit $2""",
        state.upper() if state else None, limit,
    )
    ids = [str(r["id"]) for r in rows]

    async def _run() -> None:
        import logging
        for bid in ids:
            try:
                await analyze_and_score(bid)
            except Exception:
                logging.getLogger("rescore").exception("rescore failed for %s", bid)

    bg.add_task(_run)
    return {"queued": len(ids), "note": "running in background; scores update as it goes"}


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
                     score_breakdown, scored_at, likely_fake_listing
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
