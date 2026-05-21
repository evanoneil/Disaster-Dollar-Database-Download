# =============================================================================
# Add Tribal Request Column to Disaster Dollar Database
#
# This script pulls tribal request data from the OpenFEMA
# DisasterDeclarationsSummaries v2 API and adds a tribal_request column
# to the main DDD CSV.
# =============================================================================

library(httr)
library(jsonlite)
library(readr)
library(dplyr)

# --- Configuration ---
csv_path <- "public/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv"
output_path <- "public/data/disaster_dollar_database_with_sba_pa_fix_2025_11_12.csv"

# --- Step 1: Load the DDD CSV ---
cat("Loading DDD CSV...\n")
ddd <- read_csv(csv_path, show_col_types = FALSE)
cat(sprintf("  Loaded %d rows\n", nrow(ddd)))

# --- Step 2: Pull tribal request data from OpenFEMA ---
# The API returns DisasterDeclarationsSummaries with a tribalRequest field.
# A single disaster number can have multiple declaration rows (one per
# designated area / declaration type), so we group by disasterNumber and
# flag TRUE if ANY row for that disaster has tribalRequest == TRUE.

cat("Fetching tribal request data from OpenFEMA API...\n")

# Fetch all records where tribalRequest is true (much smaller than full dataset)
tribal_url <- paste0(
  "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries",
  "?$select=disasterNumber,tribalRequest",
  "&$filter=tribalRequest%20eq%20true",
  "&$top=1000"
)

response <- GET(tribal_url)

if (status_code(response) != 200) {
  stop("Failed to fetch data from OpenFEMA API. Status: ", status_code(response))
}

tribal_json <- content(response, as = "text", encoding = "UTF-8")
tribal_data <- fromJSON(tribal_json)$DisasterDeclarationsSummaries

cat(sprintf("  Found %d declaration rows with tribalRequest = TRUE\n", nrow(tribal_data)))

# Get unique disaster numbers with tribal requests
tribal_disaster_numbers <- unique(tribal_data$disasterNumber)
cat(sprintf("  Corresponding to %d unique disaster numbers\n", length(tribal_disaster_numbers)))

# --- Step 3: Add the tribal_request column ---
ddd <- ddd %>%
  mutate(tribal_request = ifelse(incident_number %in% tribal_disaster_numbers, TRUE, FALSE))

tribal_count <- sum(ddd$tribal_request, na.rm = TRUE)
cat(sprintf("  Matched %d rows in DDD as tribal requests\n", tribal_count))

# Print the matched disasters for verification
if (tribal_count > 0) {
  cat("\nTribal request disasters found in DDD:\n")
  ddd %>%
    filter(tribal_request == TRUE) %>%
    select(incident_number, event, state) %>%
    print(n = Inf)
}

# --- Step 4: Write updated CSV ---
cat(sprintf("\nWriting updated CSV to: %s\n", output_path))
write_csv(ddd, output_path)
cat("Done!\n")
