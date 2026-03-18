const API_URL = "https://api.oilpriceapi.com/v1/prices/past_month";

async function fetchOilHistory() {
  const apiKey = process.env.OILPRICE_API_KEY;
  if (!apiKey) {
    throw new Error("OILPRICE_API_KEY is not set");
  }

  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`OilPrice API error: ${res.status}`);
  }

  const json = await res.json();
  const prices = json?.data?.prices ?? [];

  // Reduce to one value per UTC date (last price seen for that date)
  const byDate = new Map();
  for (const p of prices) {
    if (!p || typeof p.price !== "number" || !p.created_at) continue;
    // Normalise to YYYY-MM-DD in UTC to match our history dates
    const date = new Date(p.created_at).toISOString().slice(0, 10);
    byDate.set(date, p.price);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, brent]) => ({ date, brent }));
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const history = await fetchOilHistory();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
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

