const BASELINE_NORMAL_DAILY = 130;

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
    const rootData = json?.data ?? {};
    const shipData = rootData?.shipCount ?? {};

    const shipsLast24h = shipData.last24h ?? null;
    const percentOfNormal =
      typeof shipsLast24h === "number"
        ? (shipsLast24h / BASELINE_NORMAL_DAILY) * 100
        : null;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // small cache to avoid hammering origin
      },
      body: JSON.stringify({
        shipsLast24h,
        currentTransits: shipData.currentTransits ?? null,
        normalDaily: BASELINE_NORMAL_DAILY,
        percentOfNormal,
        straitStatus: rootData.straitStatus ?? null,
        oilPrice: rootData.oilPrice ?? null,
        strandedVessels: rootData.strandedVessels ?? null,
        diplomacy: rootData.diplomacy ?? null,
        insurance: rootData.insurance ?? null,
        throughput: rootData.throughput ?? null,
        globalTradeImpact: rootData.globalTradeImpact ?? null,
        supplyChainImpact: rootData.supplyChainImpact ?? null,
        news: Array.isArray(rootData.news) ? rootData.news.slice(0, 5) : null,
        lastUpdated: rootData.lastUpdated ?? null,
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

