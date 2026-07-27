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
    "MA": ["Boston", "Worcester", "Springfield", "Lowell", "Cambridge", "Brockton",
           "New Bedford", "Quincy", "Lynn", "Fall River", "Newton", "Lawrence",
           "Somerville", "Framingham", "Haverhill", "Plymouth", "Taunton"],
    "RI": ["Providence", "Warwick", "Cranston", "Pawtucket", "East Providence",
           "Woonsocket", "Coventry", "Cumberland", "North Kingstown", "South Kingstown"],
    "NY": ["Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle",
           "Mount Vernon", "Schenectady", "Utica", "White Plains", "Poughkeepsie"],
    "NJ": ["Newark", "Jersey City", "Paterson", "Elizabeth", "Edison", "Woodbridge",
           "Toms River", "Hamilton", "Trenton", "Clifton", "Cherry Hill", "Brick"],
    "PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton",
           "Bethlehem", "Lancaster", "Harrisburg", "York", "Altoona"],
    "MD": ["Baltimore", "Columbia", "Germantown", "Silver Spring", "Frederick",
           "Waldorf", "Glen Burnie", "Rockville", "Annapolis", "Salisbury"],
    "VA": ["Virginia Beach", "Chesapeake", "Norfolk", "Richmond", "Newport News",
           "Alexandria", "Hampton", "Roanoke", "Portsmouth", "Suffolk", "Lynchburg"],
    "NC": ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem",
           "Fayetteville", "Cary", "Wilmington", "High Point", "Concord", "Asheville"],
    "SC": ["Charleston", "Columbia", "North Charleston", "Mount Pleasant",
           "Rock Hill", "Greenville", "Summerville", "Goose Creek", "Sumter"],
}

INDUSTRIES = ["tree_service", "excavation", "septic", "concrete",
              "hvac", "plumbing", "electrical", "roofing", "landscaping",
              "pressure_washing", "cleaning"]
