# Hormuz Traffic Monitor
<img width="1247" height="964" alt="image" src="https://github.com/user-attachments/assets/9b1447ce-7023-4322-affa-2d56f1bcecb9" />

## Updating stored data

Oil prices are **your own copy** in `data/oil-history.json`, refreshed **once per day** via GitHub Actions (set repo secret `OILPRICE_API_KEY`). Each run saves the snapshot for the **previous UTC day**, so the chart only ever shows completed days while the live totals stay in the summary cards. The live site reads that file from GitHub — not OilPrice on every visit.

**Locally** (after copying `example.env` → `.env` and adding the key):

```bash
npm run update-oil    # merge latest API → data/oil-history.json
npm run update-ships  # Hormuz ship history → data/hormuz-history.json
npm run update-data   # both
```

Then commit `data/oil-history.json` (and ship history if changed) or rely on the scheduled workflow. The script also stores yesterday’s ship total because it runs right after midnight UTC, so the chart reflects completed days only.

**Manual run on GitHub:** Actions → “Update Hormuz history” → Run workflow.
