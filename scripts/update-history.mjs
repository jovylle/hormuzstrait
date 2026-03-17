import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_PATH = path.resolve(__dirname, "..", "data", "hormuz-history.json");
const DASHBOARD_URL = "https://hormuzstraitmonitor.com/api/dashboard";

async function main() {
  const today = new Date().toISOString().slice(0, 10);

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

  const updatedEntry = {
    date: today,
    shipsLast24h: shipData.last24h ?? null,
    normalDaily: shipData.normalDaily ?? null,
    percentOfNormal: shipData.percentOfNormal ?? null,
  };

  const withoutToday = history.filter((d) => d.date !== today);
  withoutToday.push(updatedEntry);
  withoutToday.sort((a, b) => (a.date < b.date ? -1 : 1));

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(withoutToday, null, 2) + "\n", "utf8");

  console.log("Updated history for", today, ":", updatedEntry);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

