import { readFileSync, existsSync } from "fs";
import { join } from "path";

const OWNER = "jovylle";
const REPO = "hormuzstrait";
const BRANCH = "master";
const PATH = "data/oil-history.json";

/**
 * Canonical oil series: committed `data/oil-history.json`, updated once daily
 * (GitHub Actions) or locally via `npm run update-oil`. Site does not call
 * OilPrice on every page load.
 */
async function fetchOilHistoryFromGitHub() {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${PATH}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    throw new Error(`GitHub raw oil-history failed: ${res.status}`);
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function readLocalOilFile() {
  try {
    const p = join(process.cwd(), "data", "oil-history.json");
    if (!existsSync(p)) return [];
    const json = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const localHistory = readLocalOilFile();
    let history = [];
    if (process.env.NETLIFY_DEV) {
      history = localHistory;
    } else {
      history = await fetchOilHistoryFromGitHub();
      if (!history.length) {
        history = localHistory;
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify(history),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load oil history" }),
    };
  }
}
