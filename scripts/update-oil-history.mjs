/**
 * Merges OilPrice past_month into data/oil-history.json (our persisted copy).
 * Run locally: npm run update-oil  (needs OILPRICE_API_KEY in .env)
 * Daily: workflow `.github/workflows/update-oil-history.yml` (secret OILPRICE_API_KEY).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Daily Brent only — tiny payload vs default `raw`, avoids frequent 504/524 timeouts */
const API_URL =
  "https://api.oilpriceapi.com/v1/prices/past_month?by_code=BRENT_CRUDE_USD&interval=1d";
const OUT_PATH = path.resolve(__dirname, "..", "data", "oil-history.json");
const MAX_DAYS = 45;
const FETCH_MAX_ATTEMPTS = 6;
/** Timeouts (504 gateway, 524 Cloudflare→origin), overload — safe to retry */
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504, 524]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPastMonth(apiKey) {
  let lastRes;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      lastRes = await fetch(API_URL, {
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: "application/json",
        },
      });
      if (lastRes.ok) return lastRes;
      if (!RETRYABLE_HTTP.has(lastRes.status) || attempt === FETCH_MAX_ATTEMPTS) {
        return lastRes;
      }
    } catch (err) {
      if (attempt === FETCH_MAX_ATTEMPTS) throw err;
      const backoff = Math.min(3000 * 2 ** (attempt - 1), 30_000);
      console.warn(
        `OilPrice request failed (${err.message}), attempt ${attempt}/${FETCH_MAX_ATTEMPTS}, waiting ${backoff}ms…`,
      );
      await sleep(backoff);
      continue;
    }
    const backoff = Math.min(3000 * 2 ** (attempt - 1), 30_000);
    console.warn(
      `OilPrice API HTTP ${lastRes.status}, attempt ${attempt}/${FETCH_MAX_ATTEMPTS}, waiting ${backoff}ms…`,
    );
    await sleep(backoff);
  }
  return lastRes;
}

function hintForOilPriceStatus(status) {
  if (status === 524) {
    return "524: Cloudflare timed out waiting for OilPrice’s server. Usually intermittent — re-run the job or `npm run update-oil` later.";
  }
  if (status === 504) {
    return "504: Gateway timeout — origin didn’t answer in time. Usually intermittent — re-run the job or `npm run update-oil` later.";
  }
  if (status === 401 || status === 403) {
    return "Auth failed — check OILPRICE_API_KEY.";
  }
  if (status === 429) {
    return "Rate limited — wait and retry.";
  }
  return "";
}

async function logOilPriceFailure(res) {
  const hint = hintForOilPriceStatus(res.status);
  console.error(
    `OilPrice API HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""} (after ${FETCH_MAX_ATTEMPTS} attempts)`,
  );
  if (hint) console.error(hint);
  try {
    const text = await res.text();
    if (text.trim()) console.error("Response body (truncated):", text.slice(0, 400));
  } catch {
    /* ignore */
  }
}

function tryLoadOilApiKeyFromDotEnv() {
  // `update-oil-history.mjs` relies on `process.env`, but locally users store the key in `.env`.
  // GitHub Actions passes the secret directly as an environment variable.
  if (process.env.OILPRICE_API_KEY) return;

  const envPath = path.resolve(__dirname, "..", ".env");
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^(?:export\s+)?OILPRICE_API_KEY=(.*)$/);
    if (!m) continue;

    let value = m[1].trim();
    // Strip surrounding quotes: OILPRICE_API_KEY="..."
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) process.env.OILPRICE_API_KEY = value;
    return;
  }
}

async function main() {
  tryLoadOilApiKeyFromDotEnv();
  const apiKey = process.env.OILPRICE_API_KEY;
  if (!apiKey) {
    const inCi = process.env.GITHUB_ACTIONS === "true";
    const msg =
      "OILPRICE_API_KEY is not set. Add repository secret OILPRICE_API_KEY (Settings → Secrets and variables → Actions).";
    if (inCi) {
      console.error(msg);
      process.exit(1);
    }
    console.warn("OILPRICE_API_KEY missing — skip oil history update (local only)");
    process.exit(0);
  }

  const res = await fetchPastMonth(apiKey);

  if (!res.ok) {
    await logOilPriceFailure(res);
    process.exit(1);
  }

  const json = await res.json();
  const prices = json?.data?.prices ?? [];

  // One Brent per UTC day: with interval=1d this is already daily; averaging still handles duplicates
  const buckets = new Map();
  for (const p of prices) {
    if (!p || typeof p.price !== "number" || !p.created_at) continue;
    const date = new Date(p.created_at).toISOString().slice(0, 10);
    if (!buckets.has(date)) buckets.set(date, []);
    buckets.get(date).push(p.price);
  }

  const fromApi = [];
  for (const [date, arr] of buckets) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    fromApi.push({
      date,
      brent: Math.round(avg * 100) / 100,
    });
  }
  fromApi.sort((a, b) => (a.date < b.date ? -1 : 1));

  const utcYesterday = new Date();
  utcYesterday.setUTCDate(utcYesterday.getUTCDate() - 1);
  const cutoffDate = utcYesterday.toISOString().slice(0, 10);
  const trimmedApi = fromApi.filter((row) => row.date <= cutoffDate);

  let existing = [];
  try {
    const raw = fs.readFileSync(OUT_PATH, "utf8");
    existing = JSON.parse(raw);
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  const byDate = new Map();
  for (const row of existing) {
    if (row?.date && typeof row.brent === "number") byDate.set(row.date, row.brent);
  }
  for (const row of trimmedApi) {
    byDate.set(row.date, row.brent);
  }

  let merged = Array.from(byDate.entries())
    .map(([date, brent]) => ({ date, brent }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (merged.length > MAX_DAYS) {
    merged = merged.slice(-MAX_DAYS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log("Oil history:", merged.length, "days, latest", merged.at(-1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
