"""asyncpg pool. Raw SQL by choice: the queries in this system are the
product (dedup upserts, lateral-join scoring views). An ORM would hide
exactly the parts we most need to control. Every query goes through
this module's pool so we get one connection story for the whole app."""
import json
import asyncpg
from .config import get_settings

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    # jsonb <-> dict transparently
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            get_settings().database_url,
            min_size=1,
            max_size=10,
            init=_init_conn,
            # Supabase pooler (pgbouncer transaction mode) can't do prepared stmts
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
