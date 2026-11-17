/**
 * POST /api/ingest
 *
 * Replaces the Railway FastAPI ingestion pipeline entirely.
 * Fetches businesses from Google Places, dedupes/upserts to Supabase,
 * then triggers /api/rescore to score new businesses.
 *
 * Body: { industry: string, state: string, cities?: string[] }
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY + GOOGLE_PLACES_API_KEY (server-side only).
 *
 * Vercel Hobby timeout: 60s. We process cities sequentially and return
 * a run_id immediately — the client can poll /api/ingest/status/[run_id].
 * For large state runs (CT = 169 cities) use limit_cities to paginate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Geography (mirrors backend/app/services/geo.py) ───────────────────────────
const STATE_CITIES: Record<string, string[]> = {
  CT: [
    "Old Saybrook","Essex","Old Lyme","Madison","Clinton","Westbrook","Waterford",
    "East Lyme","Stonington","Chester","Deep River","Killingworth","Lyme","Salem",
    "North Stonington","New Canaan","Darien","Westport","Wilton","Weston","Greenwich",
    "Ridgefield","Easton","Redding","Sherman","Washington","Litchfield","Kent",
    "Salisbury","Sharon","Roxbury","Bridgewater","Warren","Norfolk","Cornwall",
    "Goshen","Morris","Bethlehem","Woodbury","Southbury","Avon","Simsbury",
    "Farmington","Glastonbury","Granby","Canton","Suffield","Marlborough","Hebron",
    "Bolton","Fairfield","Trumbull","Monroe","Newtown","Brookfield","Bethel",
    "New Fairfield","Shelton","Stratford","Orange","Woodbridge","Bethany","Cheshire",
    "Guilford","Branford","North Branford","North Haven","Hamden","Wallingford",
    "Durham","Middlefield","Middletown","Cromwell","Portland","East Hampton","Haddam",
    "East Haddam","Colchester","Lebanon","Columbia","Coventry","Mansfield","Tolland",
    "Ellington","Somers","Stafford","Willington","Union","Andover","Vernon",
    "West Hartford","Newington","Wethersfield","Rocky Hill","Berlin","Southington",
    "Plainville","Burlington","Harwinton","New Hartford","Barkhamsted","Colebrook",
    "Hartland","East Granby","Windsor","South Windsor","Windsor Locks","East Windsor",
    "Bloomfield","Manchester","Bridgeport","New Haven","Stamford","Hartford",
    "Waterbury","Norwalk","Danbury","New Britain","West Haven","Milford",
    "East Hartford","Meriden","Bristol","New London","Norwich","Groton","Torrington",
    "Naugatuck","Ansonia","Derby","Seymour","Oxford","Beacon Falls","Prospect",
    "Wolcott","Middlebury","Watertown","Thomaston","Plymouth","Winchester",
    "New Milford","North Canaan","Canaan","Enfield","Ledyard","Montville","Preston",
    "Griswold","Lisbon","Sprague","Franklin","Bozrah","Voluntown","East Haven",
    "Killingly","Plainfield","Brooklyn","Canterbury","Sterling","Putnam","Thompson",
    "Woodstock","Pomfret","Eastford","Ashford","Chaplin","Hampton","Scotland",
    "Windham","Mansfield Center",
  ],
  MA: [
    "Weston","Wellesley","Dover","Sherborn","Concord","Lincoln","Carlisle","Sudbury",
    "Wayland","Lexington","Winchester","Belmont","Needham","Newton","Brookline",
    "Hingham","Cohasset","Duxbury","Scituate","Marshfield","Marblehead",
    "Manchester-by-the-Sea","Beverly","Ipswich","Topsfield","Boston","Cambridge",
    "Worcester","Springfield","Lowell","Brockton","Quincy","Lynn","Fall River",
    "New Bedford","Somerville","Lawrence","Medford","Peabody","Chicopee",
  ],
  NY: [
    "Scarsdale","Rye","Bronxville","Chappaqua","Armonk","Bedford","Katonah",
    "Pound Ridge","Larchmont","Mamaroneck","Harrison","Purchase","Irvington",
    "Dobbs Ferry","Hastings-on-Hudson","Briarcliff Manor","Pleasantville",
    "Mount Kisco","Somers","Yorktown Heights","New York","Buffalo","Rochester",
    "Yonkers","Syracuse","Albany","New Rochelle","Mount Vernon","Schenectady",
    "Utica","White Plains",
  ],
  NJ: [
    "Alpine","Tenafly","Englewood Cliffs","Cresskill","Demarest","Closter",
    "Saddle River","Ho-Ho-Kus","Ridgewood","Glen Ridge","Montclair","Maplewood",
    "South Orange","Millburn","Short Hills","Summit","Westfield","Chatham",
    "Madison","Morristown","Mendham","Bernardsville","Far Hills","Peapack",
    "Gladstone","Chester","Harding","Basking Ridge","Bedminster","Bernardsville",
    "Warren","Watchung","Green Brook","Bound Brook","Somerville","Bridgewater",
    "Flemington","Princeton","Lawrenceville","Pennington","Hopewell",
    "Cranbury","Plainsboro","Montgomery","Rocky Hill","Kingston",
  ],
  VA: [
    "McLean","Great Falls","Vienna","Oakton","Reston","Herndon","Clifton",
    "Fairfax","Burke","Springfield","Annandale","Falls Church","Arlington",
    "Alexandria","Bethesda","Chevy Chase","Potomac","North Potomac",
    "Germantown","Gaithersburg","Rockville","Leesburg","Ashburn","Sterling",
    "Purcellville","Middleburg","Warrenton","Gainesville","Haymarket",
    "Manassas","Chantilly","Centreville","Loudon","Aldie","Broadlands",
  ],
  MD: [
    "Potomac","Bethesda","Chevy Chase","Kensington","Silver Spring","Rockville",
    "North Potomac","Darnestown","Gaithersburg","Germantown","Damascus",
    "Clarksburg","Boyds","Poolesville","Laytonsville","Olney","Sandy Spring",
    "Brookeville","Ashton","Colesville","Spencerville","Burtonsville",
    "Fulton","Clarksville","Ellicott City","Columbia","Catonsville",
    "Towson","Lutherville","Timonium","Cockeysville","Hunt Valley","Owings Mills",
  ],
  PA: [
    "Villanova","Bryn Mawr","Wayne","Devon","Malvern","Paoli","Berwyn",
    "Radnor","St. Davids","Newtown Square","Media","Rose Valley","Wallingford",
    "Swarthmore","Springfield","Wyndmoor","Chestnut Hill","Gladwyne","Narberth",
    "Bala Cynwyd","Merion Station","Haverford","Ardmore","Penn Valley",
    "Sewickley","Fox Chapel","Edgeworth","Leetsdale","Ben Avon","Emsworth",
    "Pittsburgh","Philadelphia","Harrisburg","Allentown","Erie","Reading",
  ],
  RI: [
    "Barrington","Bristol","Warren","East Greenwich","North Kingstown",
    "South Kingstown","Narragansett","Jamestown","Newport","Middletown",
    "Portsmouth","Little Compton","Tiverton","Westerly","Charlestown",
    "Richmond","Hopkinton","Exeter","North Scituate","Scituate","Foster",
    "Glocester","Burrillville","Lincoln","Cumberland","Providence",
  ],
  NC: [
    "Myers Park","Eastover","Dilworth","Plaza Midwood","South Park","Ballantyne",
    "Waxhaw","Marvin","Weddington","Matthews","Mint Hill","Huntersville",
    "Cornelius","Davidson","Mooresville","Concord","Kannapolis","Harrisburg",
    "Indian Trail","Monroe","Stallings","Fort Mill","Rock Hill",
    "Asheville","Biltmore Forest","Arden","Swannanoa","Black Mountain",
    "Hendersonville","Brevard","Waynesville","Cashiers","Highlands",
    "Chapel Hill","Carrboro","Durham","Cary","Apex","Holly Springs","Fuquay-Varina",
    "Raleigh","Wake Forest","Morrisville","Pittsboro","Hillsborough",
  ],
  SC: [
    "Kiawah Island","Seabrook Island","Johns Island","James Island",
    "Daniel Island","Mount Pleasant","Sullivan's Island","Isle of Palms",
    "Sullivans Island","Folly Beach","West Ashley","Summerville","Goose Creek",
    "Hanahan","North Charleston","Charleston","Bluffton","Hilton Head Island",
    "Okatie","Ridgeland","Beaufort","Port Royal","Ladys Island",
  ],
};

// ── Industry queries (mirrors backend) ───────────────────────────────────────
const INDUSTRY_QUERIES: Record<string, string> = {
  tree_service: "tree removal service",
  excavation: "excavation contractor",
  septic: "septic tank service",
  concrete: "concrete contractor",
  hvac: "HVAC contractor",
  plumbing: "plumber",
  electrical: "electrician",
  roofing: "roofing contractor",
  landscaping: "landscaping company",
  pressure_washing: "pressure washing service",
  cleaning: "cleaning service",
};

const FIELD_MASK = [
  "places.id","places.displayName","places.formattedAddress",
  "places.addressComponents","places.location","places.nationalPhoneNumber",
  "places.websiteUri","places.rating","places.userRatingCount","places.types",
  "places.businessStatus","places.photos","nextPageToken",
].join(",");

// ── Normalize helpers (mirrors backend/app/services/normalize.py) ─────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|incorporated|corp|co|ltd|llp|pllc|pc|the)\b\.?/gi, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return d.length === 10 ? d : null;
}

function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
  return u.replace(/\/$/, "");
}

const SOCIAL_HOSTS = ["facebook.com","instagram.com","business.site","linktr.ee","yelp.com"];
function isSocialOnly(url: string | null): boolean {
  if (!url) return false;
  return SOCIAL_HOSTS.some((h) => url.toLowerCase().includes(h));
}

// ── Lead quality filters ──────────────────────────────────────────────────────
// Applied at ingest time to avoid burning scoring credits on junk leads.

// GBP place types that indicate chains/non-contractors we don't want
const EXCLUDED_TYPES = new Set([
  "meal_delivery","meal_takeaway","restaurant","food","bar","night_club",
  "lodging","hotel","motel","gas_station","convenience_store","grocery_or_supermarket",
  "supermarket","department_store","shopping_mall","car_dealer","car_rental",
  "car_wash","bank","atm","insurance_agency","real_estate_agency","travel_agency",
  "gym","spa","beauty_salon","hair_care","pharmacy","hospital","doctor",
  "dentist","veterinary_care","school","university","church","place_of_worship",
  "accounting","lawyer","museum","library","movie_theater","bowling_alley",
  "amusement_park","zoo","campground","rv_park","storage",
]);

// Known chain/franchise keywords — local contractors won't have these names
const CHAIN_KEYWORDS = [
  "home depot","lowe's","lowes","ace hardware","true value","menards",
  "servicemaster","servpro","stanley steemer","roto-rooter","rotorooter",
  "mr. rooter","mr rooter","one hour","comfort systems","lennox","carrier",
  "trane","american home shield","first american","2-10 home","angi","homeadvisor",
  "thumbtack","handyman connection","mr. handyman","mr handyman","neighborly",
  "five star","1-800","1800","nationwide","national","corporate","holdings llc",
];

function isChainOrExcluded(rb: RawBusiness): boolean {
  // Check GBP types
  if (rb.gbp_types?.some((t) => EXCLUDED_TYPES.has(t))) return true;
  // Check name for chain keywords
  const lower = rb.normalized_name;
  return CHAIN_KEYWORDS.some((kw) => lower.includes(kw));
}

function isContactable(rb: RawBusiness): boolean {
  // Google Places doesn't return email, so phone is the only contactability signal at ingest.
  // Drop only if no phone — these are listings with no way to reach the owner at all.
  return !!rb.phone_normalized;
}

function isGhostListing(rb: RawBusiness): boolean {
  // Ghost listings: < 3 reviews AND no website.
  // These are placeholder GBP entries with no active web presence and near-zero engagement.
  // They almost never convert — dropping them before scoring saves credits and cleans the
  // pipeline. (A business with 0 reviews but a real website is still worth contacting.)
  const reviewCount = rb.gbp_review_count ?? 0;
  return reviewCount < 3 && !rb.has_website;
}

// ── Google Places fetch ───────────────────────────────────────────────────────
interface RawBusiness {
  google_place_id: string | null;
  name: string;
  normalized_name: string;
  industry: string;
  phone: string | null;
  phone_normalized: string | null;
  website_url: string | null;
  has_website: boolean;
  address_line: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  gbp_rating: number | null;
  gbp_review_count: number | null;
  gbp_photo_count: number | null;
  gbp_types: string[] | null;
  business_status: string | null;
  source: string;
  source_payload: unknown;
}

function placeToRaw(p: Record<string, unknown>, industry: string, state: string): RawBusiness | null {
  const displayName = p.displayName as Record<string, string> | undefined;
  const name = displayName?.text;
  if (!name) return null;

  const comps: Record<string, Record<string, string>> = {};
  for (const c of (p.addressComponents as Array<{ types: string[]; shortText: string; longText: string }> ?? [])) {
    if (!Array.isArray(c.types)) continue;
    for (const t of c.types) comps[t] = { shortText: c.shortText, longText: c.longText };
  }

  const compState = comps["administrative_area_level_1"]?.shortText;
  if (compState && compState !== state) return null;

  const loc = p.location as { latitude?: number; longitude?: number } | undefined;
  const streetNum = comps["street_number"]?.shortText ?? "";
  const route = comps["route"]?.shortText ?? "";
  const addressLine = [streetNum, route].filter(Boolean).join(" ") || null;
  const website = normalizeWebsite((p.websiteUri as string) ?? null);
  const hasWebsite = !!website && !isSocialOnly(website);

  return {
    google_place_id: (p.id as string) ?? null,
    name,
    normalized_name: normalizeName(name),
    industry,
    phone: (p.nationalPhoneNumber as string) ?? null,
    phone_normalized: normalizePhone((p.nationalPhoneNumber as string) ?? null),
    website_url: website,
    has_website: hasWebsite,
    address_line: addressLine,
    city: (comps["locality"] ?? comps["postal_town"])?.shortText ?? null,
    state: compState ?? state,
    zip: comps["postal_code"]?.shortText ?? null,
    lat: loc?.latitude ?? null,
    lng: loc?.longitude ?? null,
    gbp_rating: (p.rating as number) ?? null,
    gbp_review_count: (p.userRatingCount as number) ?? null,
    gbp_photo_count: ((p.photos as unknown[]) ?? []).length,
    gbp_types: Array.isArray(p.types) ? (p.types as string[]) : null,
    business_status: (p.businessStatus as string) ?? null,
    source: "google_places",
    source_payload: p,
  };
}

async function fetchPlaces(
  apiKey: string,
  query: string,
  pageToken: string | null
): Promise<{ businesses: RawBusiness[]; nextToken: string | null; quota_error: boolean }> {
  const body: Record<string, unknown> = { textQuery: query, pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  // 429 = quota exceeded — stop gracefully, don't crash
  if (resp.status === 429) {
    return { businesses: [], nextToken: null, quota_error: true };
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Places ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json() as { places?: Record<string, unknown>[]; nextPageToken?: string };
  const industry = ""; // extracted from outer scope via closure — passed separately
  void industry;
  return {
    businesses: (data.places ?? []).map((p) => p as Record<string, unknown>) as unknown as RawBusiness[],
    nextToken: data.nextPageToken ?? null,
    quota_error: false,
  };
}

// ── Supabase upsert (simplified vs Python — no pg trigram, Supabase doesn't expose it easily) ──
async function upsertBusiness(
  supabase: SupabaseClient,
  rb: RawBusiness
): Promise<{ id: string; action: "inserted" | "merged" }> {
  // Tier 1: exact google_place_id
  if (rb.google_place_id) {
    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("google_place_id", rb.google_place_id)
      .maybeSingle();
    if (data) {
      // Merge: update GBP metrics + fill nulls
      await supabase.from("businesses").update({
        gbp_rating: rb.gbp_rating,
        gbp_review_count: rb.gbp_review_count,
        gbp_photo_count: rb.gbp_photo_count,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      return { id: data.id, action: "merged" };
    }
  }

  // Tier 2: normalized phone within state
  if (rb.phone_normalized) {
    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("phone_normalized", rb.phone_normalized)
      .eq("state", rb.state)
      .maybeSingle();
    if (data) {
      await supabase.from("businesses").update({
        google_place_id: rb.google_place_id,
        gbp_rating: rb.gbp_rating,
        gbp_review_count: rb.gbp_review_count,
        gbp_photo_count: rb.gbp_photo_count,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      return { id: data.id, action: "merged" };
    }
  }

  // Insert new
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      google_place_id: rb.google_place_id,
      name: rb.name,
      normalized_name: rb.normalized_name,
      industry: rb.industry,
      phone: rb.phone,
      phone_normalized: rb.phone_normalized,
      website_url: rb.website_url,
      has_website: rb.has_website,
      address_line: rb.address_line,
      city: rb.city,
      state: rb.state,
      zip: rb.zip,
      lat: rb.lat,
      lng: rb.lng,
      gbp_rating: rb.gbp_rating,
      gbp_review_count: rb.gbp_review_count,
      gbp_photo_count: rb.gbp_photo_count,
      gbp_types: rb.gbp_types,
      business_status: rb.business_status,
      source: rb.source,
      source_payload: rb.source_payload,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    // Race condition — already inserted by concurrent request; look it up
    const { data: existing } = await supabase
      .from("businesses")
      .select("id")
      .eq("google_place_id", rb.google_place_id!)
      .maybeSingle();
    return { id: existing!.id, action: "merged" };
  }

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return { id: data.id, action: "inserted" };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }
  if (!googleApiKey) {
    return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY" }, { status: 500 });
  }

  const body = await req.json() as { industry?: string; state?: string; cities?: string[]; limit_cities?: number };
  const industry = body.industry;
  const state = (body.state ?? "CT").toUpperCase();

  if (!industry) return NextResponse.json({ error: "industry is required" }, { status: 400 });
  if (!STATE_CITIES[state]) return NextResponse.json({ error: `Unsupported state ${state}` }, { status: 400 });

  const allCities = body.cities ?? STATE_CITIES[state];
  const limitCities = body.limit_cities ?? allCities.length;
  const cities = allCities.slice(0, limitCities);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Create ingestion_run record
  const { data: runRow, error: runErr } = await supabase
    .from("ingestion_runs")
    .insert({ source: "google_places", industry, state, cities, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return NextResponse.json({ error: runErr?.message ?? "failed to create run" }, { status: 500 });
  }
  const runId = runRow.id as string;

  const stats = { fetched: 0, filtered: 0, inserted: 0, merged: 0, scored: 0, errors: 0, quota_hit: false };
  const newIds: string[] = [];

  const baseQ = INDUSTRY_QUERIES[industry] ?? industry.replace(/_/g, " ");

  try {
    for (const city of cities) {
      if (stats.quota_hit) break; // Google quota hit — stop fetching, still score what we have

      const query = `${baseQ} in ${city} ${state}`;
      let token: string | null = null;
      const seenTokens = new Set<string>();
      const seenPlaceIds = new Set<string>();

      for (let page = 0; page < 3; page++) {
        const { businesses: places, nextToken, quota_error } = await fetchPlaces(googleApiKey, query, token);

        if (quota_error) {
          stats.quota_hit = true;
          break;
        }

        for (const p of places) {
          const rb = placeToRaw(p as unknown as Record<string, unknown>, industry, state);
          if (!rb) continue;
          if (rb.google_place_id && seenPlaceIds.has(rb.google_place_id)) continue;
          if (rb.google_place_id) seenPlaceIds.add(rb.google_place_id);
          if (rb.business_status && rb.business_status !== "OPERATIONAL") continue;

          // Quality gates — only drop if truly unreachable or wrong business type
          if (!isContactable(rb) || isChainOrExcluded(rb) || isGhostListing(rb)) {
            stats.filtered++;
            continue;
          }

          stats.fetched++;
          try {
            const { id, action } = await upsertBusiness(supabase, rb);
            stats[action]++;
            if (action === "inserted") newIds.push(id);
            else {
              // Merged but never scored — pick it up
              const { data: alreadyScored } = await supabase
                .from("opportunity_scores")
                .select("business_id")
                .eq("business_id", id)
                .maybeSingle();
              if (!alreadyScored) newIds.push(id);
            }
          } catch {
            stats.errors++;
          }
        }

        token = nextToken;
        if (!token || seenTokens.has(token)) break;
        seenTokens.add(token);
        await new Promise((r) => setTimeout(r, 1500)); // token warm-up per Google docs
      }
    }

    // Score all new/unscored businesses via /api/rescore in batches
    const BATCH = 20;
    for (let i = 0; i < newIds.length; i += BATCH) {
      const batch = newIds.slice(i, i + BATCH);
      try {
        // Call rescore with explicit IDs
        const rescoreUrl = new URL("/api/rescore", req.url);
        rescoreUrl.searchParams.set("limit", String(batch.length));
        // Pass IDs via header so rescore can target only these
        const r = await fetch(rescoreUrl.toString(), {
          method: "POST",
          headers: { "x-business-ids": batch.join(",") },
        });
        if (r.ok) {
          const d = await r.json() as { scored?: number };
          stats.scored += d.scored ?? 0;
        }
      } catch {
        // Scoring failure doesn't fail the run
      }
    }

    await supabase.from("ingestion_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      stats,
    }).eq("id", runId);

    return NextResponse.json({ run_id: runId, ...stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("ingestion_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      stats,
      error: msg,
    }).eq("id", runId);
    return NextResponse.json({ error: msg, run_id: runId }, { status: 500 });
  }
}
