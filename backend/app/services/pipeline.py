"""Ingestion pipeline: adapter → normalize → dedup/upsert → analyze site
→ score. Runs as a FastAPI background task; state lives in
ingestion_runs so a crash is visible, not silent. (Upgrade path at
scale: move run_ingestion into an ARQ/Celery worker — the function
signature already takes only IDs and primitives, so it lifts cleanly.)"""
import asyncio
import logging

from ..db import get_pool
from .adapters.base import BaseAdapter
from .dedupe import upsert_business
from .scoring import BusinessFacts, score_and_store
from .website_analyzer import analyze_website, save_snapshot

log = logging.getLogger("pipeline")

ANALYZE_CONCURRENCY = 8


async def run_ingestion(run_id: str, adapter: BaseAdapter,
                        industry: str, state: str, cities: list[str]) -> None:
    pool = await get_pool()
    stats = {"fetched": 0, "inserted": 0, "merged": 0, "scored": 0, "errors": 0}
    await pool.execute(
        "update ingestion_runs set status='running', started_at=now() where id=$1", run_id
    )
    new_ids: list[str] = []
    try:
        async for rb in adapter.fetch(industry, state, cities):
            stats["fetched"] += 1
            if rb.business_status and rb.business_status != "OPERATIONAL":
                continue
            try:
                async with pool.acquire() as conn:
                    async with conn.transaction():
                        bid, action = await upsert_business(conn, rb)
                stats[action] += 1
                if action == "inserted":
                    new_ids.append(bid)
                else:
                    # Merged duplicate that was never scored (e.g. its first
                    # run died mid-way) — pick it up now instead of stranding it.
                    scored = await pool.fetchval(
                        "select 1 from opportunity_scores where business_id=$1 limit 1", bid
                    )
                    if not scored:
                        new_ids.append(bid)
            except Exception:
                stats["errors"] += 1
                log.exception("upsert failed for %s", rb.name)
        # Analyze + score new businesses with bounded concurrency.
        sem = asyncio.Semaphore(ANALYZE_CONCURRENCY)

        async def _analyze(bid: str) -> None:
            async with sem:
                try:
                    await analyze_and_score(bid)
                    stats["scored"] += 1
                except Exception:
                    stats["errors"] += 1
                    log.exception("scoring failed for %s", bid)

        await asyncio.gather(*(_analyze(b) for b in new_ids))
        await pool.execute(
            "update ingestion_runs set status='completed', finished_at=now(), stats=$2 where id=$1",
            run_id, stats,
        )
    except Exception as e:
        log.exception("run %s failed", run_id)
        await pool.execute(
            "update ingestion_runs set status='failed', finished_at=now(), stats=$2, error=$3 where id=$1",
            run_id, stats, str(e),
        )


async def analyze_and_score(business_id: str) -> int:
    """Re-usable unit: crawl current site state and append a fresh score.
    Called by ingestion, the rescore endpoint, and the nightly n8n cron."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """select website_url, has_website, gbp_rating, gbp_review_count,
                  gbp_photo_count, website_discovered
           from businesses where id=$1""", business_id,
    )
    if not row:
        raise ValueError(f"business {business_id} not found")
    site = await analyze_website(row["website_url"])
    async with pool.acquire() as conn:
        async with conn.transaction():
            await save_snapshot(conn, business_id, site)
            # Harvest a contact email off the site if we don't already have one.
            # Only fills blanks — never overwrites a better address.
            if site.contact_email:
                await conn.execute(
                    "update businesses set email = $2 where id = $1 and email is null",
                    business_id, site.contact_email,
                )
            facts = BusinessFacts(
                has_website=row["has_website"], website_url=row["website_url"],
                gbp_rating=float(row["gbp_rating"]) if row["gbp_rating"] is not None else None,
                gbp_review_count=row["gbp_review_count"],
                gbp_photo_count=row["gbp_photo_count"],
                website_discovered=row["website_discovered"],
            )
            return await score_and_store(conn, business_id, facts, site)
