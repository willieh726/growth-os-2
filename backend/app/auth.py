"""Auth dependencies.

- User endpoints: the frontend sends the Supabase session token; we verify
  it against Supabase's auth API (GET /auth/v1/user). This works regardless
  of which token-signing scheme the Supabase project uses, at the cost of
  one HTTP call — softened by a short in-process cache. (Upgrade path at
  scale: verify locally against Supabase's JWKS.)
- Machine endpoints (n8n crons, webhooks): X-Internal-Key header.
- AUTH_DISABLED=true bypasses user auth for local dev only.
"""
import time

import httpx
from fastapi import Header, HTTPException, status

from .config import get_settings

# token -> (user_payload, cached_until_epoch)
_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 300  # seconds
_CACHE_MAX = 1000


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    s = get_settings()
    if s.auth_disabled:
        return {"id": "dev-user", "email": "dev@local"}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")

    hit = _cache.get(token)
    if hit and hit[1] > time.time():
        return hit[0]

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{s.supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": s.supabase_anon_key},
        )
    if r.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    user = r.json()

    if len(_cache) > _CACHE_MAX:
        _cache.clear()
    _cache[token] = (user, time.time() + _CACHE_TTL)
    return user


async def require_internal(x_internal_key: str | None = Header(default=None)) -> None:
    if x_internal_key != get_settings().internal_api_key:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad internal key")


async def require_user_or_internal(
    authorization: str | None = Header(default=None),
    x_internal_key: str | None = Header(default=None),
) -> dict:
    """For endpoints used by both humans (dashboard) and machines (crons),
    e.g. starting ingestion runs."""
    if x_internal_key and x_internal_key == get_settings().internal_api_key:
        return {"id": "internal", "email": "cron@internal"}
    return await require_user(authorization)
