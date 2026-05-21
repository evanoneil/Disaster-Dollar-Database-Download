# =============================================================================
# Add Common Names to Disaster Dollar Database
#
# This script reads the "Big Storms and FEMA Codes - Events.csv" file and
# merges the common names into the main DDD CSV by incident_number.
# =============================================================================

library(readr)
library(dplyr)

# --- Configuration ---
csv_path <- "public/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv"
common_names_path <- "public/data/Big Storms and FEMA Codes - Events.csv"
output_path <- "public/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv"

# --- Step 1: Load both CSVs ---
cat("Loading DDD CSV...\n")
ddd <- read_csv(csv_path, show_col_types = FALSE)
cat(sprintf("  Loaded %d rows\n", nrow(ddd)))

cat("Loading common names CSV...\n")
common_names <- read_csv(common_names_path, show_col_types = FALSE)
cat(sprintf("  Loaded %d common name entries\n", nrow(common_names)))

# Clean column names (the CSV has columns: incident_number, Common Name 1, Common Name 2, Common Name 3, and possibly a trailing empty column)
common_names <- common_names %>%
  select(incident_number, `Common Name 1`, `Common Name 2`, `Common Name 3`) %>%
  rename(
    common_name_1 = `Common Name 1`,
    common_name_2 = `Common Name 2`,
    common_name_3 = `Common Name 3`
  )

# Replace empty strings with NA
common_names <- common_names %>%
  mutate(
    common_name_1 = ifelse(common_name_1 == "" | is.na(common_name_1), NA_character_, common_name_1),
    common_name_2 = ifelse(common_name_2 == "" | is.na(common_name_2), NA_character_, common_name_2),
    common_name_3 = ifelse(common_name_3 == "" | is.na(common_name_3), NA_character_, common_name_3)
  )

cat("\nCommon names to be merged:\n")
print(common_names, n = Inf)

# --- Step 2: Check for incident_number matches ---
matched <- ddd$incident_number %in% common_names$incident_number
cat(sprintf("\n%d of %d common name entries match incident numbers in DDD\n",
            sum(common_names$incident_number %in% ddd$incident_number),
            nrow(common_names)))

# Show any unmatched common names
unmatched <- common_names %>%
  filter(!(incident_number %in% ddd$incident_number))
if (nrow(unmatched) > 0) {
  cat("\nWARNING: The following common name entries have no match in DDD:\n")
  print(unmatched)
}

# --- Step 3: Remove existing common_name columns if they exist (for re-runs) ---
ddd <- ddd %>%
  select(-any_of(c("common_name_1", "common_name_2", "common_name_3")))

# --- Step 4: Left join common names onto DDD ---
ddd <- ddd %>%
  left_join(common_names, by = "incident_number")

names_added <- sum(!is.na(ddd$common_name_1))
cat(sprintf("  Added common names to %d rows in DDD\n", names_added))

# --- Step 5: Write updated CSV ---
cat(sprintf("\nWriting updated CSV to: %s\n", output_path))
write_csv(ddd, output_path, na = "")
cat("Done!\n")
