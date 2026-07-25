"""Auth dependencies.

- User endpoints: verify Supabase Auth JWT (HS256, project JWT secret).
- Machine endpoints (n8n crons, webhooks): X-Internal-Key header.
AUTH_DISABLED=true bypasses user auth for local dev only.
"""
from fastapi import Depends, Header, HTTPException, status
from jose import jwt, JWTError
from .config import get_settings


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    s = get_settings()
    if s.auth_disabled:
        return {"sub": "dev-user", "email": "dev@local"}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
        )
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
    return payload


async def require_internal(x_internal_key: str | None = Header(default=None)) -> None:
    if x_internal_key != get_settings().internal_api_key:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad internal key")
