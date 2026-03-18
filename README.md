# Hormuz Traffic Monitor

## Updating stored data

Oil prices are **your own copy** in `data/oil-history.json`, refreshed **once per day** via GitHub Actions (set repo secret `OILPRICE_API_KEY`). The live site reads that file from GitHub — not OilPrice on every visit.

**Locally** (after copying `example.env` → `.env` and adding the key):

```bash
npm run update-oil    # merge latest API → data/oil-history.json
npm run update-ships  # Hormuz ship history → data/hormuz-history.json
npm run update-data   # both
```

Then commit `data/oil-history.json` (and ship history if changed) or rely on the scheduled workflow.

**Manual run on GitHub:** Actions → “Update Hormuz history” → Run workflow.
