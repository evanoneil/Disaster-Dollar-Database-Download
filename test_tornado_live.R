# Live GDELT test: run the real query + tornado extractor against a few known
# tornado declarations to eyeball candidate quality before the full run.
suppressPackageStartupMessages({
  library(readr); library(dplyr); library(stringr)
  library(httr2); library(jsonlite); library(lubridate); library(tibble)
})

src <- readLines("fetch_common_names.R")
grab_block <- function(h) {
  s <- grep(h, src)[1]; closes <- grep("^\\)$", src); e <- closes[closes > s][1]
  paste(src[s:e], collapse = "\n")
}
# config + helpers needed by query_gdelt / extractor
`%||%` <- function(a, b) { if (is.null(a) || length(a) == 0) return(b); if (is.atomic(a) && length(a) == 1 && is.na(a)) return(b); a }
GDELT_MAX <- 100
eval(parse(text = grab_block("^STATE_NAMES <- c")))
eval(parse(text = grab_block("^NAME_STOPWORDS <- c")))
# query_gdelt function block
qs <- grep("^query_gdelt <- function", src)[1]
qe <- grep("^# --- Candidate extraction", src)[1] - 1
eval(parse(text = paste(src[qs:qe], collapse = "\n")))
# tornado block
ts <- grep("^# --- Tornado mode:", src)[1]; te <- grep("^# --- Date parsing", src)[1] - 1
eval(parse(text = paste(src[ts:te], collapse = "\n")))

tests <- tribble(
  ~inc,  ~state_full, ~start,        ~end,
  4630,  "Kentucky",  "2021-12-10",  "2021-12-11",   # Mayfield / Quad-State
  4779,  "Iowa",      "2024-04-26",  "2024-04-27"    # Greenfield 2024
)
Sys.sleep(20)  # let GDELT rate limit cool down before starting

for (k in seq_len(nrow(tests))) {
  r <- tests[k, ]
  kw <- paste(TORNADO_KEYWORDS, collapse = " OR ")
  q  <- sprintf('(%s) "%s" sourcelang:eng sourcecountry:us', kw, r$state_full)
  cat(sprintf("\n=== %s | %s | %s..%s ===\n", r$inc, r$state_full, r$start, r$end))
  arts <- query_gdelt(q, as.Date(r$start), as.Date(r$end) + 30)
  Sys.sleep(5.5)
  if (is.null(arts) || !"title" %in% names(arts)) { cat("  no articles\n"); next }
  cat(sprintf("  %d articles\n", nrow(arts)))
  cand <- extract_tornado_candidates(arts$title)
  if (nrow(cand) == 0) { cat("  no candidates\n"); next }
  print(as.data.frame(head(cand, 12)), row.names = FALSE)
}
