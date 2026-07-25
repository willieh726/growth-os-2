"""Three-tier dedup + merge-don't-discard upsert.

Tier 1: google_place_id exact (authoritative).
Tier 2: normalized phone within state (a business's phone is its identity
        in this market segment).
Tier 3: trigram name similarity > 0.55 within the same zip.

On match we MERGE: fill nulls on the existing row, never overwrite
non-null values with provider data of unknown freshness — except GBP
metrics, which are always refreshed (review counts move weekly)."""
import asyncpg

from .adapters.base import RawBusiness
from .normalize import normalize_name, normalize_phone, normalize_website, is_social_only


async def find_existing(conn: asyncpg.Connection, rb: RawBusiness) -> str | None:
    if rb.google_place_id:
        row = await conn.fetchrow(
            "select id from businesses where google_place_id = $1", rb.google_place_id
        )
        if row:
            return str(row["id"])
    phone = normalize_phone(rb.phone)
    if phone:
        row = await conn.fetchrow(
            "select id from businesses where phone_normalized = $1 and state = $2",
            phone, rb.state,
        )
        if row:
            return str(row["id"])
    if rb.zip:
        row = await conn.fetchrow(
            """select id from businesses
               where zip = $1 and similarity(normalized_name, $2) > 0.55
               order by similarity(normalized_name, $2) desc limit 1""",
            rb.zip, normalize_name(rb.name),
        )
        if row:
            return str(row["id"])
    return None


async def upsert_business(conn: asyncpg.Connection, rb: RawBusiness) -> tuple[str, str]:
    """Returns (business_id, action) where action is 'inserted' | 'merged'."""
    website = normalize_website(rb.website_url)
    has_website = bool(website) and not is_social_only(website)
    existing_id = await find_existing(conn, rb)

    if existing_id:
        await conn.execute(
            """update businesses set
                 google_place_id  = coalesce(google_place_id, $2),
                 phone            = coalesce(phone, $3),
                 phone_normalized = coalesce(phone_normalized, $4),
                 email            = coalesce(email, $5),
                 website_url      = coalesce(website_url, $6),
                 has_website      = has_website or $7,
                 address_line     = coalesce(address_line, $8),
                 city             = coalesce(city, $9),
                 zip              = coalesce(zip, $10),
                 lat              = coalesce(lat, $11),
                 lng              = coalesce(lng, $12),
                 gbp_rating       = coalesce($13, gbp_rating),
                 gbp_review_count = coalesce($14, gbp_review_count),
                 gbp_photo_count  = coalesce($15, gbp_photo_count),
                 business_status  = coalesce($16, business_status)
               where id = $1""",
            existing_id, rb.google_place_id, rb.phone, normalize_phone(rb.phone),
            rb.email, website, has_website, rb.address_line, rb.city, rb.zip,
            rb.lat, rb.lng, rb.gbp_rating, rb.gbp_review_count,
            rb.gbp_photo_count, rb.business_status,
        )
        return existing_id, "merged"

    row = await conn.fetchrow(
        """insert into businesses
             (google_place_id, name, normalized_name, industry, phone,
              phone_normalized, email, website_url, has_website, address_line,
              city, state, zip, lat, lng, gbp_rating, gbp_review_count,
              gbp_photo_count, gbp_types, business_status, source, source_payload)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
           on conflict (google_place_id) do update set updated_at = now()
           returning id""",
        rb.google_place_id, rb.name, normalize_name(rb.name), rb.industry,
        rb.phone, normalize_phone(rb.phone), rb.email, website, has_website,
        rb.address_line, rb.city, rb.state, rb.zip, rb.lat, rb.lng,
        rb.gbp_rating, rb.gbp_review_count, rb.gbp_photo_count, rb.gbp_types,
        rb.business_status, rb.source, rb.payload,
    )
    return str(row["id"]), "inserted"
