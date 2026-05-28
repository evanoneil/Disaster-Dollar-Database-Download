# =============================================================================
# Fetch Common Names for Disaster Declarations
#
# Pulls colloquial / media-used names for FEMA disaster declarations by
# querying the GDELT 2.0 DOC API for news articles in the event window and
# extracting named-entity candidates from article titles.
#
# For pre-2015 events (before GDELT v2 coverage) or when GDELT returns no
# usable candidates, falls back to OpenFEMA's declarationTitle field.
#
# Idempotent: only fetches declarations that don't already have a name in
# Big Storms and FEMA Codes - Events.csv. Manual entries (source == 'manual')
# are never overwritten.
#
# Output columns added to Events.csv:
#   - source: gdelt_media | fema_title | manual
#   - confidence: high | med | low
#   - candidate_frequency: how many distinct articles mentioned the top name
#   - sample_url: one representative article URL (for review)
#
# Also writes common_names_review.csv for med/low-confidence entries so you
# can spot-check before re-running add_common_names.R.
#
# Usage:
#   Rscript fetch_common_names.R              # full run
#   Rscript fetch_common_names.R --dry-run    # no writes, just report
#   Rscript fetch_common_names.R --limit 20   # first 20 missing (for testing)
# =============================================================================

suppressPackageStartupMessages({
  library(readr)
  library(dplyr)
  library(stringr)
  library(httr2)
  library(jsonlite)
  library(lubridate)
})

# Null-coalesce helper (base R < 4.4 doesn't have one, and we also want NA-safe)
`%||%` <- function(a, b) {
  if (is.null(a) || length(a) == 0) return(b)
  if (is.atomic(a) && length(a) == 1 && is.na(a)) return(b)
  a
}

# --- Configuration ------------------------------------------------------------

DDD_CSV       <- "public/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv"
EVENTS_CSV    <- "public/data/Big Storms and FEMA Codes - Events.csv"
REVIEW_CSV    <- "public/data/common_names_review.csv"
TORNADO_REVIEW_CSV <- "public/data/tornado_names_review.csv"
# Raw GDELT titles per event are cached here so extraction/stopwords can be
# re-tuned offline (via rebuild_tornado_review.R) without re-querying GDELT.
TORNADO_TITLES_CACHE <- "public/data/tornado_titles_cache.rds"
TORNADO_TOP_N <- 12   # candidates to surface per event in the review CSV

# Tornado mode (--tornado): focus exclusively on tornado common names.
# Scope is Tornado + Severe Storm declarations (big tornado outbreaks are often
# filed as "Severe Storm"), GDELT-only (FEMA titles never carry colloquial
# tornado names), forces tornado keywords/patterns, and only assigns a name when
# >=2 distinct articles agree. Writes review rows to TORNADO_REVIEW_CSV.
TORNADO_SCOPE_TYPES <- c("Tornado", "Severe Storm")
TORNADO_MIN_FREQ    <- 2

GDELT_V2_START <- as.Date("2015-02-18")  # GDELT 2.0 GKG/event coverage start
# The GDELT 2.0 *DOC* (article search) API only indexes articles from
# 2017-01-01 onward — querying earlier dates returns "Invalid query start date".
GDELT_DOC_START <- as.Date("2017-01-01")
GDELT_DELAY    <- 5.5                     # GDELT enforces ~1 req / 5 sec
GDELT_MAX      <- 100                     # articles per query
POST_EVENT_DAYS <- 30                     # extend query window N days past incident_end
CHECKPOINT_EVERY <- 25                    # save events.csv every N rows

# Parse CLI args
args <- commandArgs(trailingOnly = TRUE)
DRY_RUN <- "--dry-run" %in% args
POST_GDELT_ONLY <- "--post-gdelt" %in% args
PRE_GDELT_ONLY  <- "--pre-gdelt"  %in% args
TORNADO_MODE    <- "--tornado"    %in% args
LIMIT <- if ("--limit" %in% args) {
  as.integer(args[which(args == "--limit") + 1])
} else {
  NA_integer_
}

# --- State abbreviation → full name mapping ----------------------------------

STATE_NAMES <- c(
  AL="Alabama", AK="Alaska", AZ="Arizona", AR="Arkansas", CA="California",
  CO="Colorado", CT="Connecticut", DE="Delaware", FL="Florida", GA="Georgia",
  HI="Hawaii", ID="Idaho", IL="Illinois", IN="Indiana", IA="Iowa",
  KS="Kansas", KY="Kentucky", LA="Louisiana", ME="Maine", MD="Maryland",
  MA="Massachusetts", MI="Michigan", MN="Minnesota", MS="Mississippi",
  MO="Missouri", MT="Montana", NE="Nebraska", NV="Nevada", NH="New Hampshire",
  NJ="New Jersey", NM="New Mexico", NY="New York", NC="North Carolina",
  ND="North Dakota", OH="Ohio", OK="Oklahoma", OR="Oregon", PA="Pennsylvania",
  RI="Rhode Island", SC="South Carolina", SD="South Dakota", TN="Tennessee",
  TX="Texas", UT="Utah", VT="Vermont", VA="Virginia", WA="Washington",
  WV="West Virginia", WI="Wisconsin", WY="Wyoming", DC="District of Columbia",
  PR="Puerto Rico", VI="Virgin Islands", GU="Guam", AS="American Samoa",
  MP="Northern Mariana Islands"
)

# --- Incident-type → GDELT query keywords ------------------------------------

INCIDENT_KEYWORDS <- list(
  "Hurricane"         = c("hurricane"),
  "Tropical Storm"    = c("\"tropical storm\""),
  "Typhoon"           = c("typhoon"),
  "Fire"              = c("wildfire", "\"forest fire\""),
  "Flood"             = c("flood", "flooding"),
  "Tornado"           = c("tornado", "\"tornado outbreak\""),
  "Severe Storm"      = c("\"severe storm\"", "\"severe weather\""),
  "Severe Ice Storm"  = c("\"ice storm\""),
  "Winter Storm"      = c("\"winter storm\"", "blizzard"),
  "Snowstorm"         = c("snowstorm", "blizzard"),
  "Coastal Storm"     = c("\"coastal storm\"", "\"nor'easter\""),
  "Earthquake"        = c("earthquake"),
  "Mud/Landslide"     = c("landslide", "mudslide"),
  "Straight-Line Winds" = c("\"straight-line winds\"", "derecho"),
  "Dam/Levee Break"   = c("\"dam break\"", "\"levee\""),
  "Freezing"          = c("\"freeze\""),
  "Volcanic Eruption" = c("volcano", "eruption"),
  "Tsunami"           = c("tsunami"),
  "Other"             = c("disaster")
)

# --- Regex patterns for extracting candidate names ---------------------------
# Each pattern captures one group: the candidate name.
# Patterns are tuned to typical media conventions.

NAME_PATTERNS <- list(
  "Hurricane" = c(
    "Hurricane\\s+([A-Z][a-z]+)",
    "Hurricanes?\\s+([A-Z][a-z]+)\\s+and\\s+([A-Z][a-z]+)"
  ),
  "Tropical Storm" = c(
    "Tropical\\s+Storm\\s+([A-Z][a-z]+)",
    "Hurricane\\s+([A-Z][a-z]+)"  # storms often reclassify
  ),
  "Typhoon" = c("Typhoon\\s+([A-Z][a-z]+)"),
  "Winter Storm" = c(
    "Winter\\s+Storm\\s+([A-Z][a-z]+)",
    "([A-Z][a-z]+)\\s+blizzard",
    "blizzard\\s+of\\s+(\\d{4})"
  ),
  "Severe Ice Storm" = c(
    "Winter\\s+Storm\\s+([A-Z][a-z]+)",
    "Ice\\s+Storm\\s+([A-Z][a-z]+)"
  ),
  "Snowstorm" = c(
    "Winter\\s+Storm\\s+([A-Z][a-z]+)",
    "([A-Z][a-z]+)\\s+[Bb]lizzard"
  ),
  "Fire" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Ff]ire\\b",
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Ww]ildfire\\b"
  ),
  "Tornado" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Tt]ornado",
    "(Super Outbreak)",
    "(Joplin\\s+tornado)"
  ),
  "Flood" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Ff]lood\\b"
  ),
  "Severe Storm" = c(
    "Hurricane\\s+([A-Z][a-z]+)",
    "Tropical\\s+Storm\\s+([A-Z][a-z]+)",
    "Winter\\s+Storm\\s+([A-Z][a-z]+)",
    "([A-Z][a-z]+)\\s+[Dd]erecho"
  ),
  "Coastal Storm" = c(
    "Hurricane\\s+([A-Z][a-z]+)",
    "([A-Z][a-z]+)\\s+nor'easter"
  ),
  "Straight-Line Winds" = c(
    "([A-Z][a-z]+)\\s+[Dd]erecho",
    "(Derecho)"
  ),
  "Earthquake" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Ee]arthquake"
  ),
  "Mud/Landslide" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Ll]andslide",
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Mm]udslide"
  ),
  "Volcanic Eruption" = c(
    "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+[Vv]olcano",
    "Mount\\s+([A-Z][a-z]+)"
  ),
  "Tsunami" = c("([A-Z][a-z]+)\\s+[Tt]sunami")
)

# Stopwords: capitalized words that look like names but aren't
NAME_STOPWORDS <- c(
  "The", "This", "That", "These", "Those", "Some", "Many", "Most", "Other",
  "State", "States", "County", "Counties", "City", "Cities", "Town", "Towns",
  "Report", "News", "Update", "Live", "Breaking", "Video", "Photo", "Photos",
  "Watch", "Weather", "Storm", "Storms", "Damage", "Death", "Deaths",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "North", "South", "East", "West", "Northern", "Southern", "Eastern", "Western",
  "New", "Old", "Major", "Massive", "Deadly", "Historic", "Devastating",
  "Severe", "Heavy", "Hurricane", "Tropical", "Winter", "Tornado", "Fire",
  "Flood", "Flooding", "Disaster", "Emergency", "National", "Federal",
  "American", "America", "Americans", "US", "USA", "United",
  "Trump", "Biden", "Obama", "FEMA", "President",
  # Generic descriptors sometimes captured as fake names
  "Wildland", "Forest", "Grass", "Wild", "Bush", "Brush", "House", "Home",
  "Large", "Small", "Local", "Various", "Multiple", "Several",
  # State names/abbrevs should be dropped too
  STATE_NAMES, names(STATE_NAMES)
)

# --- Tornado mode: keywords, patterns, extractor -----------------------------
# Tornadoes have no canonical names; media identifies them by hardest-hit place
# ("Joplin Tornado", "Mayfield Tornado"), named outbreak ("Super Outbreak",
# "Quad-State Tornado"), or date ("December 2021 Tornado Outbreak"). We harvest
# all of these forms from article titles and let frequency pick the winner.

TORNADO_KEYWORDS <- c("tornado", "tornadoes", "\"tornado outbreak\"")

TORNADO_MONTHS <- "January|February|March|April|May|June|July|August|September|October|November|December"

# High-signal SPECIAL forms — named outbreaks and date-based outbreaks. These
# are captured verbatim wherever they appear.
TORNADO_SPECIAL_PATTERNS <- c(
  "\\b(Super\\s+Outbreak)\\b",
  "\\b(Quad-?State)\\b",
  "\\b(Tri-?State)\\b",
  sprintf("\\b((?:%s)\\s+\\d{4})\\s+[Tt]ornado", TORNADO_MONTHS),
  "\\b(\\d{4})\\s+[Tt]ornado\\s+[Oo]utbreak\\b"
)

# PLACE detection does NOT rely on adjacency to "tornado": in real headlines the
# hardest-hit town ("Mayfield", "Joplin") is the most-repeated proper noun in
# the coverage, but is usually phrased as "tornado in Mayfield", "Mayfield
# candle factory", "Mayfield, Kentucky" — rarely "Mayfield tornado". So we count
# the frequency of every 1-2 word proper noun across all titles and let the most
# common (non-stopword, non-state) one win.
TORNADO_NOUN_PATTERN <- "\\b([A-Z][a-z]{2,}(?:[- ][A-Z][a-z]{2,})?)\\b"

# Descriptors / adjectives that sit next to "tornado" but aren't place names.
TORNADO_DESC_STOPWORDS <- c(
  # size / severity adjectives
  "Deadly", "Deadliest", "Massive", "Major", "Minor", "Huge", "Large",
  "Largest", "Biggest", "Powerful", "Violent", "Monster", "Monstrous",
  "Catastrophic", "Devastating", "Destructive", "Dangerous", "Strong",
  "Strongest", "Brief", "Weak", "Killer", "Giant", "Terrible", "Horrific",
  "Significant", "Intense", "Extreme", "Freak", "Sudden", "Worst", "Tragic",
  "Incredible", "Unprecedented", "Historic", "Rare", "Surprise",
  # certainty / count words
  "Possible", "Confirmed", "Reported", "Suspected", "Likely", "Apparent",
  "Another", "First", "Second", "Third", "Last", "Next", "Same", "One",
  "Two", "Three", "Multiple", "Numerous", "Several", "Recent", "Latest",
  # time words
  "Night", "Morning", "Afternoon", "Evening", "Today", "Yesterday",
  "Overnight", "Early", "Late", "Long", "Daytime", "Nighttime",
  "Spring", "Summer", "Autumn", "Sunday", "Christmas", "Thanksgiving",
  # verbs / fragments
  "Track", "Tracked", "Spawned", "Spawn", "Spotted", "Caught",
  # EF-scale tokens
  "Ef", "Ef0", "Ef1", "Ef2", "Ef3", "Ef4", "Ef5", "Big", "Holiday",
  # leading function / connector words that start a captured fragment
  "For", "After", "As", "When", "While", "Before", "Amid", "Over", "Into",
  "With", "From", "And", "But", "About", "Following", "During", "Despite",
  "Because", "Since", "Their", "His", "Her", "Its", "Our", "Your", "More",
  "Here", "There", "What", "Why", "How", "Where", "Who", "Live", "Latest",
  # tornado-coverage nouns that aren't places
  "Outbreak", "Outbreaks", "Warning", "Warnings", "Watch", "Watches",
  "Damage", "Recovery", "Aftermath", "Cleanup", "Victims", "Survivors",
  "Relief", "Aid", "Path", "Season", "Alley", "Touchdown", "Touchdowns",
  "Cleanup", "Rebuild", "Rebuilding", "Anniversary", "Outbreak", "Twister",
  "Twisters", "Funnel", "Supercell", "Supercells", "Radar", "Forecast",
  "Tornado", "Tornadoes", "Tag", "Tags", "Force", "Archives", "Cares",
  "Video", "Photos", "Gallery", "Slideshow", "Map", "Maps", "Coverage",
  # titles / honorifics (people who appear in coverage, not places)
  "Gov", "Governor", "President", "Sen", "Senator", "Rep", "Mayor", "Dr",
  "Biden", "Jill", "Trump", "Harris", "Beshear", "Sheriff", "Chief",
  # regions / directions / non-place geographies
  "Midwest", "Midwestern", "Southeast", "Southeastern", "Northeast",
  "Northeastern", "Southwest", "Southwestern", "Northwest", "Northwestern",
  "Plains", "Heartland", "Dixie", "Caribbean", "Asia", "Europe", "Gulf",
  "Coast", "Region", "Area", "Bay Area", "Central", "Tornado Alley",
  # title-case verbs / gerunds / fragments
  "Bringing", "Touched", "Touching", "Causing", "Leaving", "Killing",
  "Spawning", "Producing", "Hitting", "Striking", "Including", "Total",
  "Down", "Through", "Across", "Leaves", "Brings", "Causes", "Kills",
  "Hits", "Strikes", "Slams", "Rips", "Tears", "Tore", "Hit", "Struck",
  "Says", "Said", "Sees", "Seen", "Left", "Made", "Makes", "Take", "Takes",
  # generic people / common nouns in coverage
  "Scientists", "Officials", "Residents", "People", "Family", "Families",
  "Crews", "Teams", "Experts", "Forecasters", "Meteorologist",
  "Meteorologists", "Workers", "Students", "Schools", "Homes", "Houses",
  "Businesses", "Neighborhood", "Neighborhoods", "Community", "Communities",
  "Church", "Churches", "Hospital", "Airport", "Downtown", "Suburb",
  # holidays / event descriptors
  "Halloween", "Easter", "Memorial", "Labor", "Independence", "Veterans",
  "Christmas", "Thanksgiving", "Outbreak"
)

TORNADO_ALL_STOPWORDS <- unique(c(NAME_STOPWORDS, TORNADO_DESC_STOPWORDS))

# Turn a captured token into a display common name.
format_tornado_name <- function(token) {
  token <- str_trim(token)
  low <- tolower(token)
  if (str_detect(low, "^super\\s+outbreak$")) return("Super Outbreak")
  if (str_detect(low, "^quad-?state$"))        return("Quad-State Tornado")
  if (str_detect(low, "^tri-?state$"))          return("Tri-State Tornado")
  # Month + year → "December 2021 Tornado Outbreak"
  if (str_detect(token, sprintf("^(?:%s)\\s+\\d{4}$", TORNADO_MONTHS))) {
    return(paste(str_to_title(token), "Tornado Outbreak"))
  }
  # Bare year → "2011 Tornado Outbreak"
  if (str_detect(token, "^\\d{4}$")) return(paste0(token, " Tornado Outbreak"))
  # Otherwise a place → "<Place> Tornado"
  paste(str_to_title(token), "Tornado")
}

# Extract + rank tornado candidates from article titles.
# Pools two signals: (1) verbatim special forms (named/date outbreaks) and
# (2) the most-frequent proper noun across the coverage (the hit town).
# Returns tibble(display_name, frequency, raw) sorted by frequency desc.
# `extra_stopwords` lets the caller drop e.g. the event's own state words.
extract_tornado_candidates <- function(titles, extra_stopwords = character(0)) {
  if (length(titles) == 0) return(tibble())
  stops <- unique(c(TORNADO_ALL_STOPWORDS, extra_stopwords))
  rows <- list()
  add <- function(token, idx) {
    rows[[length(rows) + 1]] <<- data.frame(
      token = str_trim(token), title_idx = idx, stringsAsFactors = FALSE
    )
  }

  # (1) Special forms — captured verbatim wherever they appear.
  for (pat in TORNADO_SPECIAL_PATTERNS) {
    m <- str_match_all(titles, pat)
    for (i in seq_along(m)) {
      mi <- m[[i]]
      if (is.null(mi) || nrow(mi) == 0) next
      for (j in seq_len(nrow(mi))) if (!is.na(mi[j, 2])) add(mi[j, 2], i)
    }
  }

  # (2) Proper-noun frequency — every 1-2 word capitalized token, but ONLY from
  # titles that actually mention a tornado. This anchors the signal so a
  # non-tornado Severe Storm (whose articles never say "tornado") yields nothing.
  torn_idx <- which(str_detect(titles, regex("tornado|twister", ignore_case = TRUE)))
  nm <- str_match_all(titles[torn_idx], TORNADO_NOUN_PATTERN)
  for (k in seq_along(nm)) {
    mi <- nm[[k]]
    if (is.null(mi) || nrow(mi) == 0) next
    i <- torn_idx[k]  # preserve original title index for distinct-title counts
    for (j in seq_len(nrow(mi))) if (!is.na(mi[j, 2])) add(mi[j, 2], i)
  }
  if (length(rows) == 0) return(tibble())

  # Special date/outbreak tokens bypass the place stopword filter.
  is_special <- function(tok) {
    str_detect(tok, regex(sprintf("^(?:%s)\\s+\\d{4}$", TORNADO_MONTHS), ignore_case = TRUE)) |
    str_detect(tok, "^\\d{4}$") |
    str_detect(tok, regex("^(super\\s+outbreak|quad-?state|tri-?state)$", ignore_case = TRUE))
  }

  cand <- do.call(rbind, rows) |>
    as_tibble() |>
    distinct(token, title_idx) |>          # one vote per token per title
    filter(!is.na(token), nchar(token) >= 3) |>
    mutate(special = is_special(token)) |>
    # Drop any token whose first OR only word is a stopword/descriptor/state.
    filter(special |
           (!str_to_title(word(token, 1)) %in% stops &
            !str_to_title(token) %in% stops)) |>
    mutate(display_name = vapply(token, format_tornado_name, character(1)))

  if (nrow(cand) == 0) return(tibble())

  cand |>
    group_by(display_name) |>
    summarise(
      frequency = n_distinct(title_idx),
      raw = first(token),
      .groups = "drop"
    ) |>
    arrange(desc(frequency))
}

# Build the tornado candidate-review table from gathered results.
# `declarations` is resolved at call time (defined later in the script).
build_tornado_review <- function(new_rows, candidate_lists, declarations) {
  if (is.null(new_rows) || nrow(new_rows) == 0) return(tibble())
  cl <- tibble(
    incident_number = as.integer(names(candidate_lists)),
    candidates = unlist(candidate_lists, use.names = FALSE)
  )
  new_rows |>
    filter(!is.na(`Common Name 1`)) |>
    left_join(declarations |> select(incident_number, incident_type, state,
                                      incident_start_d, year),
              by = "incident_number") |>
    left_join(cl, by = "incident_number") |>
    mutate(chosen_name = `Common Name 1`) |>   # pre-fill with top pick; edit me
    select(incident_number, year, incident_type, state,
           chosen_name, candidates,
           top_pick = `Common Name 1`, confidence, candidate_frequency,
           sample_url) |>
    arrange(year, incident_number)
}

# --- Date parsing (CSV dates are m/d/yy) -------------------------------------

parse_csv_date <- function(s) {
  # incident_start/end are like "6/21/25" — 2-digit year
  d <- suppressWarnings(as.Date(s, format = "%m/%d/%y"))
  # Any parses that yield far-future dates are 19xx (none expected here, all 2003+)
  d
}

# --- GDELT query -------------------------------------------------------------

query_gdelt <- function(query_string, start_date, end_date, max_records = GDELT_MAX) {
  start_dt <- format(as.POSIXct(start_date), "%Y%m%d000000")
  end_dt   <- format(as.POSIXct(end_date) + 86399, "%Y%m%d235959")

  url <- "https://api.gdeltproject.org/api/v2/doc/doc"

  tryCatch({
    resp <- request(url) |>
      req_url_query(
        query = query_string,
        mode = "artlist",
        format = "json",
        maxrecords = max_records,
        startdatetime = start_dt,
        enddatetime = end_dt,
        sort = "hybridrel"
      ) |>
      req_user_agent("DDD-common-names-fetcher/1.0") |>
      req_timeout(30) |>
      req_retry(
        max_tries = 4,
        backoff = ~ 8 + runif(1, 0, 4),  # 8-12s backoff on 429/5xx
        is_transient = function(resp) resp_status(resp) %in% c(429, 500, 502, 503, 504)
      ) |>
      req_perform()

    body <- resp_body_string(resp)
    if (nchar(body) < 5) return(NULL)
    # GDELT sometimes returns plain-text errors even with 200
    if (!str_detect(body, "^\\s*\\{")) {
      cat(sprintf("    ! GDELT non-JSON: %s\n", substr(body, 1, 80)))
      return(NULL)
    }
    parsed <- tryCatch(fromJSON(body), error = function(e) NULL)
    if (is.null(parsed) || is.null(parsed$articles)) return(NULL)
    parsed$articles
  }, error = function(e) {
    cat(sprintf("    ! GDELT error: %s\n", conditionMessage(e)))
    NULL
  })
}

# --- Candidate extraction ----------------------------------------------------

extract_candidates <- function(titles, incident_type) {
  patterns <- NAME_PATTERNS[[incident_type]]
  if (is.null(patterns) || length(titles) == 0) return(tibble())

  rows <- list()
  for (pat in patterns) {
    m <- str_match_all(titles, pat)  # list: one matrix per title
    for (i in seq_along(m)) {
      mi <- m[[i]]
      if (is.null(mi) || nrow(mi) == 0) next
      for (j in seq_len(nrow(mi))) {
        rows[[length(rows) + 1]] <- data.frame(
          name = mi[j, 2],
          title_idx = i,
          stringsAsFactors = FALSE
        )
      }
    }
  }
  if (length(rows) == 0) return(tibble())

  combined <- do.call(rbind, rows) |>
    as_tibble() |>
    filter(!is.na(name), nchar(name) >= 3) |>
    filter(!name %in% NAME_STOPWORDS) |>
    mutate(name_norm = str_to_title(name))

  if (nrow(combined) == 0) return(tibble())

  # Frequency: count distinct titles per name
  combined |>
    group_by(name_norm) |>
    summarise(
      frequency = n_distinct(title_idx),
      raw_name = first(name),
      .groups = "drop"
    ) |>
    arrange(desc(frequency))
}

# --- OpenFEMA fallback -------------------------------------------------------

fetch_fema_title <- function(disaster_number) {
  tryCatch({
    resp <- request("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries") |>
      req_url_query(
        `$filter` = sprintf("disasterNumber eq %s", disaster_number),
        `$select` = "declarationTitle",
        `$top` = 1
      ) |>
      req_timeout(15) |>
      req_retry(max_tries = 2) |>
      req_perform()
    parsed <- fromJSON(resp_body_string(resp))
    titles <- parsed$DisasterDeclarationsSummaries$declarationTitle
    if (length(titles) == 0 || is.null(titles)) return(NA_character_)
    titles[1]
  }, error = function(e) {
    cat(sprintf("    ! FEMA API error: %s\n", conditionMessage(e)))
    NA_character_
  })
}

# Extract a likely common name from a FEMA title like
# "HURRICANE KATRINA" or "SEVERE STORMS AND FLOODING FROM HURRICANE IDA"
extract_name_from_fema_title <- function(title, incident_type) {
  if (is.na(title) || nchar(title) == 0) return(NA_character_)
  t <- str_to_title(title)

  # Try the most specific patterns first
  patterns_by_type <- list(
    "Hurricane" = c("Hurricane\\s+([A-Z][a-z]+)"),
    "Tropical Storm" = c("Tropical\\s+Storm\\s+([A-Z][a-z]+)", "Hurricane\\s+([A-Z][a-z]+)"),
    "Typhoon" = c("Typhoon\\s+([A-Z][a-z]+)"),
    "Severe Storm" = c("Hurricane\\s+([A-Z][a-z]+)", "Tropical\\s+Storm\\s+([A-Z][a-z]+)"),
    "Fire" = c("([A-Z][a-z]+)\\s+[Ff]ires?\\b"),
    "Coastal Storm" = c("Hurricane\\s+([A-Z][a-z]+)")
  )

  patterns <- patterns_by_type[[incident_type]]
  if (!is.null(patterns)) {
    for (p in patterns) {
      m <- str_match(t, p)
      if (!is.na(m[1, 1])) {
        # Return the full match (e.g., "Hurricane Katrina") with proper casing
        return(str_to_title(m[1, 1]))
      }
    }
  }

  NA_character_
}

# --- Load data ---------------------------------------------------------------

cat("Loading main DDD CSV...\n")
ddd <- read_csv(DDD_CSV, show_col_types = FALSE)
cat(sprintf("  %d rows, %d unique incident_numbers\n",
            nrow(ddd), length(unique(ddd$incident_number))))

cat("Loading existing Events.csv...\n")
existing <- read_csv(EVENTS_CSV, show_col_types = FALSE)
# Drop trailing unnamed columns from the CSV
existing <- existing[, !grepl("^\\.\\.\\.|^$", names(existing))]

# Ensure schema: add new columns if missing, mark existing as manual
for (col in c("source", "confidence", "candidate_frequency", "sample_url")) {
  if (!col %in% names(existing)) existing[[col]] <- NA
}
existing$source[is.na(existing$source) & !is.na(existing$`Common Name 1`)] <- "manual"
existing$confidence[existing$source == "manual" & is.na(existing$confidence)] <- "high"

cat(sprintf("  %d existing entries (%d manual)\n",
            nrow(existing), sum(existing$source == "manual", na.rm = TRUE)))

# --- Determine which declarations need processing ---------------------------

# Dedupe main CSV to one row per incident_number, keeping the row with highest
# federal dollar total (most-affected state = best media coverage)
declarations <- ddd |>
  mutate(
    incident_start_d = parse_csv_date(incident_start),
    incident_end_d   = parse_csv_date(incident_end),
    total_fed = coalesce(ihp_total, 0) + coalesce(pa_total, 0) +
                coalesce(cdbg_dr_allocation, 0)
  ) |>
  group_by(incident_number) |>
  arrange(desc(total_fed)) |>
  slice(1) |>
  ungroup() |>
  select(incident_number, state, incident_type, incident_start_d,
         incident_end_d, year, total_fed)

# Protect manual entries; fetch everything else missing a name
manual_ids <- existing$incident_number[existing$source == "manual" &
                                        !is.na(existing$`Common Name 1`)]
already_fetched_ids <- existing$incident_number[!is.na(existing$`Common Name 1`) &
                                                  existing$source %in% c("gdelt_media", "fema_title")]

needs_fetch <- declarations |>
  filter(!incident_number %in% manual_ids) |>
  filter(!incident_number %in% already_fetched_ids)

if (TORNADO_MODE) {
  # Tornado-only: scope to Tornado + Severe Storm, restricted to the GDELT DOC
  # API's covered window (2017+; FEMA titles never carry colloquial tornado
  # names, so pre-2017 events can't be auto-named and are left for manual entry).
  needs_fetch <- needs_fetch |>
    filter(incident_type %in% TORNADO_SCOPE_TYPES) |>
    filter(!is.na(incident_start_d), incident_start_d >= GDELT_DOC_START)
}

if (POST_GDELT_ONLY) {
  needs_fetch <- needs_fetch |>
    filter(!is.na(incident_start_d), incident_start_d >= GDELT_V2_START)
}
if (PRE_GDELT_ONLY) {
  needs_fetch <- needs_fetch |>
    filter(is.na(incident_start_d) | incident_start_d < GDELT_V2_START)
}

if (!is.na(LIMIT)) {
  needs_fetch <- head(needs_fetch, LIMIT)
}

if (TORNADO_MODE) {
  cat(sprintf("\n[TORNADO MODE] scope = %s, GDELT-only, min freq = %d\n",
              paste(TORNADO_SCOPE_TYPES, collapse = " + "), TORNADO_MIN_FREQ))
}

cat(sprintf("\n%d declarations need common names\n", nrow(needs_fetch)))
cat(sprintf("  pre-GDELT (before %s): %d → FEMA title fallback only\n",
            GDELT_V2_START,
            sum(needs_fetch$incident_start_d < GDELT_V2_START, na.rm = TRUE)))
cat(sprintf("  post-GDELT: %d → GDELT + FEMA fallback\n",
            sum(needs_fetch$incident_start_d >= GDELT_V2_START, na.rm = TRUE)))

if (DRY_RUN) {
  cat("\n[DRY RUN] Exiting without fetching.\n")
  quit(status = 0)
}

if (nrow(needs_fetch) == 0) {
  cat("\nNothing to do.\n")
  quit(status = 0)
}

# --- Fetch loop --------------------------------------------------------------

results <- list()
candidate_lists <- list()   # tornado mode: top-N candidate strings, keyed by incident_number
title_cache <- list()       # tornado mode: raw GDELT titles per event, for offline re-tuning
n <- nrow(needs_fetch)
start_time <- Sys.time()

for (i in seq_len(n)) {
  row <- needs_fetch[i, ]
  inc <- row$incident_number
  itype <- row$incident_type
  state_full <- STATE_NAMES[row$state]
  if (is.na(state_full)) state_full <- row$state

  elapsed <- round(as.numeric(difftime(Sys.time(), start_time, units = "secs")))
  cat(sprintf("[%d/%d] %s | %s | %s | start=%s [%ds elapsed]\n",
              i, n, inc, itype, row$state,
              as.character(row$incident_start_d), elapsed))

  use_gdelt <- !is.na(row$incident_start_d) &&
               row$incident_start_d >= GDELT_V2_START
  candidates <- tibble()
  sample_url <- NA_character_

  if (use_gdelt) {
    keywords <- if (TORNADO_MODE) TORNADO_KEYWORDS else (INCIDENT_KEYWORDS[[itype]] %||% c(tolower(itype)))
    kw_query <- paste(keywords, collapse = " OR ")
    query <- sprintf('(%s) "%s" sourcelang:eng sourcecountry:us',
                     kw_query, state_full)

    end_d <- row$incident_end_d
    if (is.na(end_d)) end_d <- row$incident_start_d + 14

    articles <- query_gdelt(
      query,
      row$incident_start_d,
      end_d + POST_EVENT_DAYS
    )

    Sys.sleep(GDELT_DELAY)

    if (!is.null(articles) && is.data.frame(articles) && nrow(articles) > 0 &&
        "title" %in% names(articles)) {
      titles <- articles$title
      if (TORNADO_MODE) {
        # Cache raw titles (+ a sample URL) so extraction can be re-tuned offline.
        title_cache[[as.character(inc)]] <- list(
          incident_number = inc, state = row$state, year = row$year,
          incident_type = itype,
          incident_start = as.character(row$incident_start_d),
          titles = titles,
          urls = if ("url" %in% names(articles)) articles$url else NA_character_
        )
      }
      candidates <- if (TORNADO_MODE) extract_tornado_candidates(titles)
                    else extract_candidates(titles, itype)

      if (nrow(candidates) > 0 && "url" %in% names(articles)) {
        # Pick a representative URL containing the top name
        top <- if (TORNADO_MODE) candidates$raw[1] else candidates$raw_name[1]
        match_idx <- which(str_detect(titles, fixed(top)))
        if (length(match_idx) > 0) sample_url <- articles$url[match_idx[1]]
      }
      cat(sprintf("    GDELT: %d articles → %d candidates\n",
                  nrow(articles), nrow(candidates)))
    } else {
      cat("    GDELT: no articles\n")
    }
  }

  # Build row
  cn1 <- cn2 <- cn3 <- NA_character_
  source <- NA_character_
  conf <- NA_character_
  freq <- NA_integer_

  if (TORNADO_MODE && nrow(candidates) > 0) {
    # Review workflow: provisionally assign the top-ranked candidate, but keep
    # the full top-N list (with frequencies) so a human can pick the real name.
    top <- candidates[1, ]
    cn1 <- top$display_name
    if (nrow(candidates) >= 2) cn2 <- candidates$display_name[2]
    if (nrow(candidates) >= 3) cn3 <- candidates$display_name[3]
    source <- "gdelt_media"
    freq <- top$frequency
    conf <- if (freq >= 5) "high" else if (freq >= TORNADO_MIN_FREQ) "med" else "low"
    topn <- head(candidates, TORNADO_TOP_N)
    candidate_lists[[as.character(inc)]] <-
      paste(sprintf("%s (%d)", topn$display_name, topn$frequency), collapse = " | ")
  } else if (nrow(candidates) > 0) {
    top <- candidates[1, ]
    # Determine full name (prefix with incident type word if pattern stripped it)
    format_name <- function(raw, itype) {
      raw <- str_trim(raw)
      itype_lower <- tolower(itype)
      # If raw already contains the incident word, leave it. Otherwise prepend.
      if (str_detect(tolower(raw), "hurricane|tropical storm|typhoon|winter storm|ice storm|fire|tornado|flood|earthquake|blizzard|derecho|volcano|tsunami|landslide|mudslide")) {
        return(str_to_title(raw))
      }
      prefix <- switch(itype,
        "Hurricane" = "Hurricane",
        "Tropical Storm" = "Tropical Storm",
        "Typhoon" = "Typhoon",
        "Winter Storm" = "Winter Storm",
        "Severe Ice Storm" = "Winter Storm",
        "Snowstorm" = "Winter Storm",
        "Fire" = NULL,  # fires are "<Place> Fire" — suffix handled below
        "Tornado" = NULL,
        "Flood" = NULL,
        "Earthquake" = NULL,
        "Volcanic Eruption" = "Mount",
        NULL
      )
      suffix <- switch(itype,
        "Fire" = "Fire",
        "Tornado" = "Tornado",
        "Flood" = "Flood",
        "Earthquake" = "Earthquake",
        NULL
      )
      out <- str_to_title(raw)
      if (!is.null(prefix)) out <- paste(prefix, out)
      if (!is.null(suffix)) out <- paste(out, suffix)
      out
    }

    cn1 <- format_name(top$raw_name, itype)
    if (nrow(candidates) >= 2) cn2 <- format_name(candidates$raw_name[2], itype)
    if (nrow(candidates) >= 3) cn3 <- format_name(candidates$raw_name[3], itype)
    source <- "gdelt_media"
    freq <- top$frequency
    conf <- if (freq >= 5) "high" else if (freq >= 2) "med" else "low"
  }

  # Fallback: OpenFEMA declarationTitle (skipped in tornado mode — FEMA titles
  # never contain colloquial tornado names, only generic "Severe Storms,
  # Tornadoes, and Flooding" descriptions).
  if (is.na(cn1) && !TORNADO_MODE) {
    ftitle <- fetch_fema_title(inc)
    Sys.sleep(0.3)
    extracted <- extract_name_from_fema_title(ftitle, itype)
    if (!is.na(extracted)) {
      cn1 <- extracted
      source <- "fema_title"
      conf <- "med"
      cat(sprintf("    FEMA title: %s → %s\n", ftitle, cn1))
    } else if (!is.na(ftitle)) {
      cat(sprintf("    FEMA title: %s (no match)\n", ftitle))
    }
  }

  # Only persist rows where we actually found a name — unfetched rows can be
  # retried on the next run since we detect them by absence from Events.csv.
  if (!is.na(cn1)) {
    results[[length(results) + 1]] <- tibble(
      incident_number = inc,
      `Common Name 1` = cn1,
      `Common Name 2` = cn2,
      `Common Name 3` = cn3,
      source = source,
      confidence = conf,
      candidate_frequency = freq,
      sample_url = sample_url
    )
    cat(sprintf("    → %s [%s/%s, freq=%s]\n",
                cn1,
                source %||% "none",
                conf %||% "none",
                freq %||% "NA"))
  } else {
    cat("    → no name found (will retry on next run)\n")
  }

  # Checkpoint save — write everything we have so far
  if (i %% CHECKPOINT_EVERY == 0 && i < n) {
    partial_new <- if (length(results) > 0) bind_rows(results) else tibble(incident_number = integer())
    if (TORNADO_MODE) {
      # Tornado mode never touches Events.csv (names are unconfirmed); checkpoint
      # the candidate-review CSV + raw-title cache instead so a long run isn't lost.
      partial_review <- build_tornado_review(partial_new, candidate_lists, declarations)
      write_csv(partial_review, TORNADO_REVIEW_CSV, na = "")
      saveRDS(title_cache, TORNADO_TITLES_CACHE)
      cat(sprintf("    [checkpoint] %d/%d processed, %d candidate events saved\n",
                  i, n, nrow(partial_review)))
    } else {
      partial_attempted <- needs_fetch$incident_number[seq_len(i)]
      checkpoint <- existing |>
        filter(!incident_number %in% partial_attempted) |>
        bind_rows(partial_new) |>
        arrange(incident_number)
      write_csv(checkpoint, EVENTS_CSV, na = "")
      cat(sprintf("    [checkpoint] %d/%d processed, %d named entries saved\n",
                  i, n, nrow(checkpoint)))
    }
  }
}

# --- Merge results back into existing events.csv ----------------------------

new_rows <- if (length(results) > 0) bind_rows(results) else tibble(incident_number = integer())
attempted_ids <- needs_fetch$incident_number  # everything we tried this run

cat(sprintf("\nAttempted %d declarations, found names for %d\n",
            length(attempted_ids), nrow(new_rows)))

if (nrow(new_rows) > 0) {
  src_summary <- new_rows |>
    count(source, confidence, sort = TRUE)
  cat("\nBy source/confidence:\n")
  print(src_summary)
}

# Update existing: drop rows we just attempted (success or fail), then bind
# back only the successful new ones. This cleans stale NA rows from prior runs.
# Tornado mode is review-only and must NOT write provisional names into
# Events.csv — it writes the candidate-review CSV below instead.
if (!TORNADO_MODE) {
  final <- existing |>
    filter(!incident_number %in% attempted_ids) |>
    bind_rows(new_rows) |>
    arrange(incident_number)

  cat(sprintf("\nWriting updated events CSV → %s (%d total rows)\n",
              EVENTS_CSV, nrow(final)))
  write_csv(final, EVENTS_CSV, na = "")
}

# --- Review CSV --------------------------------------------------------------

if (TORNADO_MODE) {
  # Candidate-list review: one row per event with the top-N ranked candidates
  # (name + article frequency) and a `chosen_name` column (pre-filled with the
  # top pick) for the human to confirm or correct.
  review <- build_tornado_review(new_rows, candidate_lists, declarations)
  cat(sprintf("Writing tornado review CSV → %s (%d events to curate)\n",
              TORNADO_REVIEW_CSV, nrow(review)))
  write_csv(review, TORNADO_REVIEW_CSV, na = "")
  saveRDS(title_cache, TORNADO_TITLES_CACHE)
  cat(sprintf("Cached raw titles for %d events → %s\n",
              length(title_cache), TORNADO_TITLES_CACHE))

  cat("\nDone. Next step: open tornado_names_review.csv, edit the 'chosen_name'\n")
  cat("column for each event, then run: Rscript apply_tornado_names.R\n")
} else {
  review <- final |>
    filter(source %in% c("gdelt_media", "fema_title"),
           confidence %in% c("med", "low"),
           !is.na(`Common Name 1`)) |>
    left_join(
      declarations |> select(incident_number, incident_type, state,
                            incident_start_d, year),
      by = "incident_number"
    ) |>
    select(incident_number, year, incident_type, state,
           `Common Name 1`, `Common Name 2`, `Common Name 3`,
           source, confidence, candidate_frequency, sample_url)

  cat(sprintf("Writing review CSV → %s (%d rows to spot-check)\n",
              REVIEW_CSV, nrow(review)))
  write_csv(review, REVIEW_CSV, na = "")

  cat("\nDone. Next step: review the med/low-confidence rows, then run:\n")
  cat("  Rscript add_common_names.R\n")
}
