# =============================================================================
# Rebuild the tornado candidate-review CSV from cached GDELT titles.
#
# fetch_common_names.R --tornado caches every event's raw article titles to
# tornado_titles_cache.rds. This script re-runs the candidate extractor over
# that cache using the CURRENT stopwords/patterns in fetch_common_names.R, so
# you can tune extraction quality offline without re-querying GDELT.
#
# Usage:
#   Rscript rebuild_tornado_review.R
# =============================================================================

suppressPackageStartupMessages({
  library(readr); library(dplyr); library(stringr); library(tibble)
})

TORNADO_TITLES_CACHE <- "public/data/tornado_titles_cache.rds"
TORNADO_REVIEW_CSV   <- "public/data/tornado_names_review.csv"
TORNADO_TOP_N        <- 12

if (!file.exists(TORNADO_TITLES_CACHE)) {
  stop("No title cache at ", TORNADO_TITLES_CACHE,
       " — run: Rscript fetch_common_names.R --tornado")
}

# --- Pull the extraction definitions out of fetch_common_names.R -------------
src <- readLines("fetch_common_names.R")
grab_block <- function(header_regex) {
  s <- grep(header_regex, src)[1]
  closes <- grep("^\\)$", src); e <- closes[closes > s][1]
  paste(src[s:e], collapse = "\n")
}
eval(parse(text = grab_block("^STATE_NAMES <- c")))
eval(parse(text = grab_block("^NAME_STOPWORDS <- c")))
t_start <- grep("^# --- Tornado mode:", src)[1]
t_end   <- grep("^# --- Date parsing", src)[1] - 1
eval(parse(text = paste(src[t_start:t_end], collapse = "\n")))

# --- Re-extract from the cache -----------------------------------------------
cache <- readRDS(TORNADO_TITLES_CACHE)
cat(sprintf("Loaded cached titles for %d events\n", length(cache)))

rows <- list()
for (key in names(cache)) {
  e <- cache[[key]]
  cand <- extract_tornado_candidates(e$titles)
  if (nrow(cand) == 0) next
  top <- cand[1, ]
  topn <- head(cand, TORNADO_TOP_N)
  # representative URL for the top candidate
  sample_url <- NA_character_
  if (!is.null(e$urls) && !all(is.na(e$urls))) {
    mi <- which(str_detect(e$titles, fixed(top$raw)))
    if (length(mi) > 0 && mi[1] <= length(e$urls)) sample_url <- e$urls[mi[1]]
  }
  rows[[length(rows) + 1]] <- tibble(
    incident_number = e$incident_number,
    year = e$year,
    incident_type = e$incident_type,
    state = e$state,
    chosen_name = top$display_name,    # pre-filled top pick; edit me
    candidates = paste(sprintf("%s (%d)", topn$display_name, topn$frequency),
                       collapse = " | "),
    top_pick = top$display_name,
    confidence = if (top$frequency >= 5) "high" else if (top$frequency >= 2) "med" else "low",
    candidate_frequency = top$frequency,
    sample_url = sample_url
  )
}

review <- if (length(rows) > 0) {
  bind_rows(rows) |> arrange(year, incident_number)
} else {
  tibble()
}

cat(sprintf("Rebuilt review for %d events with candidates\n", nrow(review)))
write_csv(review, TORNADO_REVIEW_CSV, na = "")
cat(sprintf("Wrote → %s\n", TORNADO_REVIEW_CSV))
