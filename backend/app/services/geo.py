"""Rollout geography. CT fully enumerated (Phase 1 start); other states
list their top markets — expand by editing lists, no code changes.
Cities, not counties: Places Text Search caps at 60 results per query,
so granularity = coverage."""

STATE_CITIES: dict[str, list[str]] = {
    # CONNECTICUT — ALL 169 TOWNS, no exceptions. Population-ranked lists
    # skip the affluent small towns (Old Saybrook, New Canaan, Litchfield),
    # which is exactly backwards: high-ticket jobs, thin competition, and
    # owners who never bothered with a website. Ordered wealth-first so a
    # partial run still hits the best markets.
    "CT": [
        # --- Tier 1: affluent shoreline, Gold Coast, Litchfield Hills ---
        "Old Saybrook", "Essex", "Old Lyme", "Madison", "Clinton",
        "Westbrook", "Waterford", "East Lyme", "Stonington", "Chester",
        "Deep River", "Killingworth", "Lyme", "Salem", "North Stonington",
        "New Canaan", "Darien", "Westport", "Wilton", "Weston",
        "Greenwich", "Ridgefield", "Easton", "Redding", "Sherman",
        "Washington", "Litchfield", "Kent", "Salisbury", "Sharon",
        "Roxbury", "Bridgewater", "Warren", "Norfolk", "Cornwall",
        "Goshen", "Morris", "Bethlehem", "Woodbury", "Southbury",
        "Avon", "Simsbury", "Farmington", "Glastonbury", "Granby",
        "Canton", "Suffield", "Marlborough", "Hebron", "Bolton",
        # --- Tier 2: mid-size towns and suburbs ---
        "Fairfield", "Trumbull", "Monroe", "Newtown", "Brookfield",
        "Bethel", "New Fairfield", "Shelton", "Stratford", "Orange",
        "Woodbridge", "Bethany", "Cheshire", "Guilford", "Branford",
        "North Branford", "North Haven", "Hamden", "Wallingford", "Durham",
        "Middlefield", "Middletown", "Cromwell", "Portland", "East Hampton",
        "Haddam", "East Haddam", "Colchester", "Lebanon", "Columbia",
        "Coventry", "Mansfield", "Tolland", "Ellington", "Somers",
        "Stafford", "Willington", "Union", "Andover", "Vernon",
        "West Hartford", "Newington", "Wethersfield", "Rocky Hill", "Berlin",
        "Southington", "Plainville", "Burlington", "Harwinton", "New Hartford",
        "Barkhamsted", "Colebrook", "Hartland", "East Granby", "Windsor",
        "South Windsor", "Windsor Locks", "East Windsor", "Bloomfield", "Manchester",
        # --- Tier 3: cities and remaining towns (full coverage) ---
        "Bridgeport", "New Haven", "Stamford", "Hartford", "Waterbury",
        "Norwalk", "Danbury", "New Britain", "West Haven", "Milford",
        "East Hartford", "Meriden", "Bristol", "New London", "Norwich",
        "Groton", "Torrington", "Naugatuck", "Ansonia", "Derby",
        "Seymour", "Oxford", "Beacon Falls", "Prospect", "Wolcott",
        "Middlebury", "Watertown", "Thomaston", "Plymouth", "Winchester",
        "New Milford", "North Canaan", "Canaan", "Enfield", "Ledyard",
        "Montville", "Preston", "Griswold", "Lisbon", "Sprague",
        "Franklin", "Bozrah", "Voluntown", "East Haven", "Killingly",
        "Plainfield", "Brooklyn", "Canterbury", "Sterling", "Putnam",
        "Thompson", "Woodstock", "Pomfret", "Eastford", "Ashford",
        "Chaplin", "Hampton", "Scotland", "Windham", "Mansfield Center",
    ],
    # ── EXPANSION STATES — every list is ordered WEALTH-FIRST by design.
    # Affluent towns have higher-ticket jobs, thinner competition, and owners
    # who never got around to a website. A partial run always hits money first.
    "MA": [
        # affluent: MetroWest, North Shore, South Shore, Cape & Islands
        "Weston", "Wellesley", "Dover", "Sherborn", "Concord",
        "Lincoln", "Carlisle", "Sudbury", "Wayland", "Lexington",
        "Winchester", "Belmont", "Needham", "Newton", "Brookline",
        "Hingham", "Cohasset", "Duxbury", "Scituate", "Marshfield",
        "Marblehead", "Manchester-by-the-Sea", "Beverly", "Ipswich", "Topsfield",
        "Boxford", "Andover", "North Andover", "Hopkinton", "Southborough",
        "Nantucket", "Edgartown", "Vineyard Haven", "Chatham", "Osterville",
        "Barnstable", "Falmouth", "Yarmouth", "Orleans", "Wellfleet",
        # major markets
        "Boston", "Worcester", "Springfield", "Lowell", "Cambridge", "Brockton",
        "New Bedford", "Quincy", "Lynn", "Fall River", "Lawrence",
        "Somerville", "Framingham", "Haverhill", "Plymouth", "Taunton",
    ],
    "RI": [
        "Barrington", "East Greenwich", "Jamestown", "Little Compton", "Narragansett",
        "Newport", "Portsmouth", "Tiverton", "Westerly", "Charlestown",
        "North Kingstown", "Middletown", "South Kingstown", "Exeter", "Scituate",
        "Lincoln", "Smithfield", "Cumberland", "Bristol", "Warren",
        "Providence", "Warwick", "Cranston", "Pawtucket", "East Providence",
        "Woonsocket", "Coventry", "Johnston", "North Providence", "West Warwick",
    ],
    "NY": [
        # Westchester
        "Scarsdale", "Rye", "Bronxville", "Chappaqua", "Armonk",
        "Bedford", "Katonah", "Pound Ridge", "Larchmont", "Mamaroneck",
        "Harrison", "Purchase", "Irvington", "Dobbs Ferry", "Hastings-on-Hudson",
        "Briarcliff Manor", "Pleasantville", "Mount Kisco", "Somers", "Yorktown Heights",
        # Hamptons / East End
        "East Hampton", "Southampton", "Bridgehampton", "Sag Harbor", "Water Mill",
        "Sagaponack", "Westhampton Beach", "Montauk", "Amagansett", "Quogue",
        # North Shore Long Island
        "Oyster Bay", "Locust Valley", "Manhasset", "Great Neck", "Roslyn",
        "Old Westbury", "Syosset", "Huntington", "Cold Spring Harbor", "Garden City",
        # upstate markets
        "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle",
        "White Plains", "Poughkeepsie", "Saratoga Springs", "Ithaca",
    ],
    "NJ": [
        "Alpine", "Saddle River", "Franklin Lakes", "Ridgewood", "Ho-Ho-Kus",
        "Tenafly", "Englewood Cliffs", "Demarest", "Closter", "Wyckoff",
        "Short Hills", "Millburn", "Summit", "Chatham", "Madison",
        "Westfield", "Mountainside", "Bernardsville", "Far Hills", "Mendham",
        "Basking Ridge", "Princeton", "Rumson", "Fair Haven", "Little Silver",
        "Colts Neck", "Holmdel", "Spring Lake", "Sea Girt", "Avon-by-the-Sea",
        "Newark", "Jersey City", "Paterson", "Elizabeth", "Edison",
        "Toms River", "Hamilton", "Trenton", "Clifton", "Cherry Hill", "Brick",
    ],
    "PA": [
        "Villanova", "Bryn Mawr", "Haverford", "Gladwyne", "Wayne",
        "Radnor", "Devon", "Malvern", "Chadds Ford", "Newtown Square",
        "Media", "Doylestown", "New Hope", "Newtown", "Yardley",
        "Sewickley", "Fox Chapel", "Mount Lebanon", "Upper St. Clair", "Wexford",
        "Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton",
        "Bethlehem", "Lancaster", "Harrisburg", "York", "West Chester",
    ],
    "MD": [
        "Potomac", "Bethesda", "Chevy Chase", "Kensington", "Severna Park",
        "Annapolis", "Ellicott City", "Clarksville", "Fulton", "Timonium",
        "Lutherville", "Towson", "Easton", "St. Michaels", "Oxford",
        "Queenstown", "Davidsonville", "Crofton", "Gambrills", "Sykesville",
        "Baltimore", "Columbia", "Germantown", "Silver Spring", "Frederick",
        "Waldorf", "Glen Burnie", "Rockville", "Salisbury", "Gaithersburg",
    ],
    "VA": [
        "McLean", "Great Falls", "Vienna", "Oakton", "Fairfax Station",
        "Clifton", "Falls Church", "Arlington", "Alexandria", "Leesburg",
        "Middleburg", "Purcellville", "Ashburn", "Warrenton", "Keswick",
        "Charlottesville", "Williamsburg", "Virginia Beach", "Chesapeake", "Norfolk",
        "Richmond", "Newport News", "Hampton", "Roanoke", "Portsmouth",
        "Suffolk", "Lynchburg", "Reston", "Herndon", "Manassas",
    ],
    "NC": [
        "Biltmore Forest", "Blowing Rock", "Pinehurst", "Southern Pines", "Davidson",
        "Cornelius", "Huntersville", "Waxhaw", "Weddington", "Matthews",
        "Chapel Hill", "Cary", "Apex", "Holly Springs", "Wake Forest",
        "Mooresville", "Wrightsville Beach", "Asheville", "Hendersonville", "Highlands",
        "Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem",
        "Fayetteville", "Wilmington", "High Point", "Concord", "Greenville",
    ],
    "SC": [
        "Kiawah Island", "Sullivans Island", "Isle of Palms", "Daniel Island", "Mount Pleasant",
        "Hilton Head Island", "Bluffton", "Beaufort", "Pawleys Island", "Georgetown",
        "Aiken", "Fort Mill", "Tega Cay", "Lexington", "Blythewood",
        "Charleston", "Columbia", "North Charleston", "Rock Hill", "Greenville",
        "Summerville", "Goose Creek", "Sumter", "Myrtle Beach", "Spartanburg",
    ],
}

INDUSTRIES = ["tree_service", "excavation", "septic", "concrete",
              "hvac", "plumbing", "electrical", "roofing", "landscaping",
              "pressure_washing", "cleaning"]
