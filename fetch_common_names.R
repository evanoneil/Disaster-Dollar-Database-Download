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

GDELT_V2_START <- as.Date("2015-02-18")  # GDELT 2.0 DOC API coverage start
GDELT_DELAY    <- 5.5                     # GDELT enforces ~1 req / 5 sec
GDELT_MAX      <- 100                     # articles per query
POST_EVENT_DAYS <- 30                     # extend query window N days past incident_end
CHECKPOINT_EVERY <- 25                    # save events.csv every N rows

# Parse CLI args
args <- commandArgs(trailingOnly = TRUE)
DRY_RUN <- "--dry-run" %in% args
POST_GDELT_ONLY <- "--post-gdelt" %in% args
PRE_GDELT_ONLY  <- "--pre-gdelt"  %in% args
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
    keywords <- INCIDENT_KEYWORDS[[itype]] %||% c(tolower(itype))
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
      candidates <- extract_candidates(titles, itype)

      if (nrow(candidates) > 0 && "url" %in% names(articles)) {
        # Pick a representative URL containing the top name
        top <- candidates$raw_name[1]
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

  if (nrow(candidates) > 0) {
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

  # Fallback: OpenFEMA declarationTitle
  if (is.na(cn1)) {
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
final <- existing |>
  filter(!incident_number %in% attempted_ids) |>
  bind_rows(new_rows) |>
  arrange(incident_number)

cat(sprintf("\nWriting updated events CSV → %s (%d total rows)\n",
            EVENTS_CSV, nrow(final)))
write_csv(final, EVENTS_CSV, na = "")

# --- Review CSV for med/low confidence --------------------------------------

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
