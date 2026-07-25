"""Rollout geography. CT fully enumerated (Phase 1 start); other states
list their top markets — expand by editing lists, no code changes.
Cities, not counties: Places Text Search caps at 60 results per query,
so granularity = coverage."""

STATE_CITIES: dict[str, list[str]] = {
    "CT": [
        "Bridgeport", "New Haven", "Stamford", "Hartford", "Waterbury",
        "Norwalk", "Danbury", "New Britain", "West Hartford", "Greenwich",
        "Fairfield", "Hamden", "Bristol", "Meriden", "Manchester",
        "West Haven", "Milford", "Stratford", "East Hartford", "Middletown",
        "Wallingford", "Enfield", "Southington", "Shelton", "Norwich",
        "Groton", "Trumbull", "Torrington", "Glastonbury", "Naugatuck",
        "Newington", "Cheshire", "Vernon", "Windsor", "New London",
        "Branford", "New Milford", "Westport", "Wethersfield", "Ridgefield",
        "Farmington", "South Windsor", "East Haven", "Guilford", "Simsbury",
        "Watertown", "Berlin", "Bloomfield", "North Haven", "Darien",
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

INDUSTRIES = ["tree_service", "excavation", "septic", "concrete"]
