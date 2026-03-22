import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_PATH = path.resolve(__dirname, "..", "data", "hormuz-history.json");
const DASHBOARD_URL = "https://hormuzstraitmonitor.com/api/dashboard";

function median(nums) {
  const a = nums.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * `last24h` is a rolling window, not a true calendar-day count — upstream can emit one-off spikes.
 * When traffic has been depressed for days, clamp obvious outliers toward recent typical levels.
 */
function smoothShipSpikeInLowTraffic(targetDate, historyRows, rawLast24h) {
  if (typeof rawLast24h !== "number" || !Number.isFinite(rawLast24h)) return rawLast24h;

  const prior = historyRows
    .filter((d) => d.date < targetDate && typeof d.shipsPassed === "number" && Number.isFinite(d.shipsPassed))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const window7 = prior.slice(-7).map((d) => d.shipsPassed);
  const window14 = prior.slice(-14).map((d) => d.shipsPassed);
  const m7 = median(window7);
  const m14 = median(window14);
  const baseline = m7 ?? m14;
  if (baseline == null) return rawLast24h;

  // “Crisis” regime: normal is ~60 but we’re seeing single-digit sustained traffic
  if (baseline > 18) return rawLast24h;

  const threshold = Math.max(2 * baseline + 6, 10);
  if (rawLast24h <= threshold) return rawLast24h;

  const replacement = Math.round(median(window7.length ? window7 : window14) ?? baseline);
  console.warn(
    `Ship count spike smoothed for ${targetDate}: ${rawLast24h} -> ${replacement} (recent median ~${baseline}, rolling last24h noise)`,
  );
  return replacement;
}

async function main() {
  const utcYesterday = new Date();
  utcYesterday.setUTCDate(utcYesterday.getUTCDate() - 1);
  const targetDate = utcYesterday.toISOString().slice(0, 10);

  const res = await fetch(DASHBOARD_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; HormuzTrafficBot/1.0; +https://github.com/jovylle/hormuzstrait)",
      Accept: "application/json, text/plain, */*",
      Referer: "https://hormuzstraitmonitor.com/",
    },
  });

  if (!res.ok) {
    console.error("Upstream dashboard error:", res.status);
    process.exit(1);
  }

  const json = await res.json();
  const shipData = json?.data?.shipCount;

  if (!shipData) {
    console.error("Missing shipCount in upstream response");
    process.exit(1);
  }

  let history = [];
  try {
    const raw = fs.readFileSync(HISTORY_PATH, "utf8");
    history = JSON.parse(raw);
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  // We only persist UTC yesterday (the current day may be incomplete).
  const withoutTargetDate = history.filter((d) => d.date !== targetDate);

  const last24hRaw = shipData.last24h ?? null;
  const updatedEntry = {
    date: targetDate,
    shipsPassed: smoothShipSpikeInLowTraffic(targetDate, withoutTargetDate, last24hRaw),
  };

  withoutTargetDate.push(updatedEntry);
  withoutTargetDate.sort((a, b) => (a.date < b.date ? -1 : 1));

  fs.writeFileSync(
    HISTORY_PATH,
    JSON.stringify(withoutTargetDate, null, 2) + "\n",
    "utf8",
  );

  console.log("Updated history for", targetDate, ":", updatedEntry);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

