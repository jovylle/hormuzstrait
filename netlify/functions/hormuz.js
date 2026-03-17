export async function handler() {
  try {
    const res = await fetch("https://hormuzstraitmonitor.com/api/dashboard", {
      headers: {
        // Try to look like a normal browser hitting their dashboard
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://hormuzstraitmonitor.com/",
      },
    });

    if (!res.ok) {
      let errorBody = null;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = null;
      }

      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "Upstream API error",
          status: res.status,
          upstreamBody: errorBody,
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

