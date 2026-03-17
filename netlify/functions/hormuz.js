export async function handler() {
  try {
    const res = await fetch("https://hormuzstraitmonitor.com/api/dashboard");

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "Upstream API error",
          status: res.status,
        }),
      };
    }

    const json = await res.json();
    const shipData = json?.data?.shipCount ?? {};

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // small cache to avoid hammering origin
      },
      body: JSON.stringify({
        shipsLast24h: shipData.last24h ?? null,
        currentTransits: shipData.currentTransits ?? null,
        normalDaily: shipData.normalDaily ?? null,
        percentOfNormal: shipData.percentOfNormal ?? null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch Hormuz data",
      }),
    };
  }
}

