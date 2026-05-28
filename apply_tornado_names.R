# =============================================================================
# Apply curated tornado names from the review CSV into Events.csv
#
# After running `Rscript fetch_common_names.R --tornado`, open
# public/data/tornado_names_review.csv and edit the `chosen_name` column for
# each event (keep the pre-filled top pick, replace it, or blank it out to skip).
# This script writes every non-blank chosen_name into Events.csv as a protected
# `manual` entry, then you re-run add_common_names.R to merge into the DDD CSV.
#
# Usage:
#   Rscript apply_tornado_names.R              # apply
#   Rscript apply_tornado_names.R --dry-run    # preview only
# =============================================================================

suppressPackageStartupMessages({
  library(readr); library(dplyr)
})

EVENTS_CSV         <- "public/data/Big Storms and FEMA Codes - Events.csv"
TORNADO_REVIEW_CSV <- "public/data/tornado_names_review.csv"
DRY_RUN <- "--dry-run" %in% commandArgs(trailingOnly = TRUE)

if (!file.exists(TORNADO_REVIEW_CSV)) {
  stop("No review file at ", TORNADO_REVIEW_CSV,
       " — run: Rscript fetch_common_names.R --tornado")
}

review <- read_csv(TORNADO_REVIEW_CSV, show_col_types = FALSE)
events <- read_csv(EVENTS_CSV, show_col_types = FALSE)
events <- events[, !grepl("^\\.\\.\\.|^$", names(events))]

# Keep only events with a non-blank chosen_name
chosen <- review |>
  mutate(chosen_name = trimws(chosen_name)) |>
  filter(!is.na(chosen_name), chosen_name != "")

cat(sprintf("%d of %d reviewed events have a chosen_name to apply\n",
            nrow(chosen), nrow(review)))
if (nrow(chosen) == 0) { cat("Nothing to apply.\n"); quit(status = 0) }

cat("\nNames to write (source = manual):\n")
chosen |> select(incident_number, year, state, chosen_name) |>
  as.data.frame() |> print(row.names = FALSE)

if (DRY_RUN) { cat("\n[DRY RUN] No changes written.\n"); quit(status = 0) }

new_rows <- tibble(
  incident_number = chosen$incident_number,
  `Common Name 1` = chosen$chosen_name,
  `Common Name 2` = NA_character_,
  `Common Name 3` = NA_character_,
  source = "manual",
  confidence = "high",
  candidate_frequency = NA_integer_,
  sample_url = NA_character_
)

# Upsert: drop any existing rows for these incidents, then add the curated ones.
final <- events |>
  filter(!incident_number %in% new_rows$incident_number) |>
  bind_rows(new_rows) |>
  arrange(incident_number)

write_csv(final, EVENTS_CSV, na = "")
cat(sprintf("\nWrote %d tornado names into %s (now %d total rows)\n",
            nrow(new_rows), EVENTS_CSV, nrow(final)))
cat("\nNext step: Rscript add_common_names.R\n")
