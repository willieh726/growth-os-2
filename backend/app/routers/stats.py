from fastapi import APIRouter, Depends

from ..auth import require_user
from ..db import get_pool

router = APIRouter(prefix="/stats", tags=["stats"], dependencies=[Depends(require_user)])


@router.get("/dashboard")
async def dashboard():
    pool = await get_pool()
    biz = await pool.fetchrow(
        """select count(*) as total,
                  count(*) filter (where not has_website) as no_website,
                  count(distinct state) as states
           from businesses"""
    )
    scores = await pool.fetchrow(
        """select count(*) filter (where opportunity_score >= 60) as hot,
                  round(avg(opportunity_score)) as avg_score
           from businesses_scored where opportunity_score is not null"""
    )
    leads = await pool.fetch("select stage, count(*) as n from leads group by stage")
    emails = await pool.fetchrow(
        """select count(*) filter (where type='email_sent')    as sent,
                  count(*) filter (where type='email_opened')  as opened,
                  count(*) filter (where type='email_replied') as replied
           from interactions where occurred_at > now() - interval '30 days'"""
    )
    enroll = await pool.fetchrow(
        """select count(*) filter (where status='active')       as active,
                  count(*) filter (where status='stopped_reply') as stopped_by_reply
           from sequence_enrollments"""
    )
    by_industry = await pool.fetch(
        """select industry, count(*) as n, round(avg(opportunity_score)) as avg_score
           from businesses_scored group by industry order by n desc"""
    )
    return {
        "businesses": dict(biz),
        "scoring": dict(scores),
        "pipeline": {r["stage"]: r["n"] for r in leads},
        "email_30d": dict(emails),
        "sequences": dict(enroll),
        "by_industry": [dict(r) for r in by_industry],
    }
