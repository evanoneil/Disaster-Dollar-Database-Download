# Offline unit test for the tornado candidate extractor.
# Sources the function/pattern definitions out of fetch_common_names.R without
# running the network pipeline, then feeds in realistic article titles.
suppressPackageStartupMessages({library(dplyr); library(stringr); library(tibble)})

src <- readLines("fetch_common_names.R")

# Helper: grab a top-level block "NAME <- c(" ... matching ")" at col 0.
grab_block <- function(header_regex) {
  s <- grep(header_regex, src)[1]
  closes <- grep("^\\)$", src)
  e <- closes[closes > s][1]
  paste(src[s:e], collapse = "\n")
}

eval(parse(text = grab_block("^STATE_NAMES <- c")))
eval(parse(text = grab_block("^NAME_STOPWORDS <- c")))

# Tornado section spans from its banner to just before the date-parsing banner.
t_start <- grep("^# --- Tornado mode:", src)
t_end   <- grep("^# --- Date parsing", src) - 1
eval(parse(text = paste(src[t_start:t_end], collapse = "\n")))

titles <- c(
  "Mayfield tornado: Kentucky town flattened by deadly storm",
  "Death toll rises after Mayfield tornado tears through Kentucky",
  "December 2021 tornado outbreak kills dozens across Kentucky",
  "Quad-State Tornado was one of the longest-tracked in history",
  "Deadly tornado hits Mayfield candle factory",
  "Massive tornado caught on camera near Mayfield",
  "Another tornado warning issued overnight",
  "Joplin tornado anniversary remembered ten years later",
  "EF5 tornado leveled Joplin in 2011",
  "Tornado that struck Bowling Green leaves trail of damage"
)

cat("=== Candidates: Dec-2021 / Joplin sample ===\n")
print(as.data.frame(extract_tornado_candidates(titles)), row.names = FALSE)

titles2 <- c(
  "Severe storms and flooding hit Tennessee this week",
  "Heavy rain causes flooding across Nashville",
  "Storm damage reported in multiple counties",
  "Power outages after severe weather"
)
cat("\n=== Candidates: non-tornado severe storm (should be empty) ===\n")
print(as.data.frame(extract_tornado_candidates(titles2)), row.names = FALSE)
