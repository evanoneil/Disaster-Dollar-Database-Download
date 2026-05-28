# Tornado Common-Names — Session Handoff

Picking back up from the session where we improved the GDELT-driven common-name
pipeline to focus on tornado events.

## Where things stand

The infrastructure is built and working end-to-end. The cache-populating GDELT
run **partially completed**: it ran the full 228-event loop (84 min) but the
network died at event ~21/228 ("Could not resolve host: api.gdeltproject.org"),
so only events 1–20 actually fetched. **11 events have candidates** in the
review CSV, **12 are cached** in titles. The remaining ~208 events need a
re-run.

## What got built this session

1. **`fetch_common_names.R`** — modified. New `--tornado` mode:
   - Scopes to `Tornado` + `Severe Storm` declarations, **2017+ only**
   - Forces tornado keywords + a new two-signal extractor:
     verbatim outbreak/date forms + **most-frequent proper noun** in
     tornado-mentioning titles (place rarely sits next to "tornado" in headlines)
   - Caches raw titles to `tornado_titles_cache.rds` so stopwords can be
     re-tuned offline (no GDELT re-query)
   - Writes `tornado_names_review.csv` with top-12 ranked candidates per event
     and a pre-filled `chosen_name` column
   - Does **not** touch `Events.csv` — provisional names stay isolated

2. **`apply_tornado_names.R`** — new. After you edit `chosen_name` in the
   review CSV, this writes confirmed names into `Events.csv` as protected
   `manual` entries. Then run `add_common_names.R` to merge into the DDD CSV.

3. **`rebuild_tornado_review.R`** — new. Regenerates the review CSV from the
   cached titles using current stopwords. Fast (no GDELT). Use this to
   iterate on extraction quality.

4. **Latent bug fixed:** `GDELT_V2_START` was set to `2015-02-18` but the
   GDELT 2.0 DOC API actually starts **2017-01-01** (added
   `GDELT_DOC_START`). This is why the existing `Events.csv` had **zero**
   `gdelt_media` rows — the GDELT path silently failed for everything
   before 2017 and fell back to FEMA titles. Tornado mode uses the correct
   date floor.

5. **Test helpers** (can stay or be deleted later):
   `test_tornado_extractor.R`, `test_tornado_live.R`.

## Outputs currently on disk

- `public/data/tornado_names_review.csv` — 11 events with candidate lists
- `public/data/tornado_titles_cache.rds` — 12 events' raw GDELT titles
- `/tmp/tornado_run.log` — full log of the partial run (will be gone after
  reboot; not critical)

## Known issues to fix next session

### 1. Re-running will re-query the 12 already-cached events (no idempotency)

Tornado mode never writes to `Events.csv`, so the existing "skip already
fetched" check in `needs_fetch` filtering doesn't apply. **Add: skip events
already present in `tornado_titles_cache.rds`** so the re-run only hits the
~216 remaining events. Place the filter in `fetch_common_names.R` next to
the existing `if (TORNADO_MODE) { ... }` filter block (around line 530-ish):

```r
if (TORNADO_MODE && file.exists(TORNADO_TITLES_CACHE)) {
  cached_ids <- as.integer(names(readRDS(TORNADO_TITLES_CACHE)))
  needs_fetch <- needs_fetch |> filter(!incident_number %in% cached_ids)
}
```

### 2. Extraction quality is still too noisy

Looking at the 11 reviewed events, top picks include obvious garbage:
"Channel Tornado" (from "Weather Channel"), "Facts Tornado" (from
"Tornadoes Fast Facts"), "Correction Tornado" (97!), "Least Tornado",
"Inside Tornado", "Contacto Latino Tornado".

Some real names DID surface in the lists ("Cindy Tornado" 13 = Tropical
Storm Cindy 2017 — correct; "Orleans Tornado" 2 for LA 2017; "Birmingham
Tornado" 5 for TN 2017). So the candidate-review approach can still recover
the right name — just the top-12 needs to be cleaner.

**Stopwords to add** to `TORNADO_DESC_STOPWORDS` in `fetch_common_names.R`:
- Media/article-language: `Channel`, `Facts`, `Fast`, `Correction`,
  `Recap`, `Bulletin`, `Headlines`, `Story`, `Stories`, `Read`, `Read More`
- Outlet/wire names: `Contacto`, `Latino`, `Reuters`, `AP`, `CNN`, `Fox`,
  `NBC`, `ABC`, `CBS`, `MSNBC`, `Bloomberg`, `Politico`
- Comparative/quantity: `Least`, `Most`, `Few`, `Many`, `Some`, `All`,
  `Nine`, `Seven`, `Four`, `Eight`, `Six`, `Five`, `Ten`, `Dozens`,
  `Hundreds`, `Thousands`, `Number`
- Position: `Inside`, `Outside`, `Behind`, `Beyond`, `Above`, `Below`
- Verbs (more): `Classifies`, `Verifying`, `Climbs`, `Issued`,
  `Confirms`, `Confirmed`, `Reports`, `Updates`, `Updated`, `Closes`
- Misc: `Mobile Home`, `Service`, `System`, `Conditions`, `Power`,
  `Mail`, `Topsy`, `Diminishing`

After adding, run `Rscript rebuild_tornado_review.R` — no GDELT call
needed; it'll re-process the 12 cached events with the new stopwords in
seconds.

### 3. Pre-2017 Tornado-type events that need manual naming separately

GDELT DOC API can't cover these. Most are famous and can just be typed in:

| inc | year | state | likely name |
|-----|------|-------|-------------|
| 1599 | 2005 | WY | (research) |
| 1612 | 2005 | IN | November 2005 Evansville Tornado |
| 1834 | 2009 | AR | (research) |
| 1921 | 2010 | MN | Wadena / Albert Lea Tornadoes |
| 1943 | 2010 | NY | Bridgeport / Brooklyn Tornadoes |
| 1994 | 2011 | MA | Springfield Tornado |
| 4157 | 2013 | IL | Washington Tornado (Nov 2013) |
| 4179 | 2014 | NE | Pilger Twin Tornadoes |
| 4205 | 2014 | MS | Louisville Tornado |
| 4275 | 2016 | MT | (research) |

Joplin (1930 MO) and Moore (4117 OK) are already named manually.

## The workflow once the review CSV is clean

1. Open `public/data/tornado_names_review.csv`
2. For each row: keep `chosen_name` as-is, replace it with a better
   candidate from `candidates`, or **blank it** to skip that event
3. `Rscript apply_tornado_names.R` — writes confirmed names into
   `public/data/Big Storms and FEMA Codes - Events.csv` as `manual` entries
4. `Rscript add_common_names.R` — merges into the main DDD CSV

## Concrete next-session order

1. **(2 min)** Add the cache-skip idempotency block above to
   `fetch_common_names.R`.
2. **(2 min)** Add the noise stopwords above to `TORNADO_DESC_STOPWORDS`.
3. **(seconds)** `Rscript rebuild_tornado_review.R` — see how much the 12
   cached events improve.
4. **(~1.5–2 hr background)** Re-run `Rscript fetch_common_names.R
   --tornado` to fetch the remaining ~216 events. Run during off-hours.
5. Review the resulting CSV, fill `chosen_name`, then
   `apply_tornado_names.R` + `add_common_names.R`.
6. Separately tackle the 10 pre-2017 Tornado-type events manually.

## Why this is harder than hurricanes

Hurricanes have canonical names (HurriCANE NAME); media uses them
consistently and they sit adjacent to "Hurricane" in headlines. Tornadoes
have no canonical names — they're identified by hit town ("Mayfield"),
named outbreak ("Quad-State"), or date ("December 2021 outbreak"), and the
place name usually appears **somewhere else** in the headline, not next to
"tornado." That's why the adjacency-regex approach (still used for
hurricanes) doesn't work and we switched to proper-noun frequency anchored
to tornado-mention titles.
