const OWNER = "jovylle";
const REPO = "hormuzstrait";
const BRANCH = "master";
const PATH = "data/hormuz-history.json";

async function fetchHistoryFromGitHub() {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${PATH}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    throw new Error(`GitHub raw fetch failed: ${res.status}`);
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
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
    const history = await fetchHistoryFromGitHub();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify(history),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load history" }),
    };
  }
}

