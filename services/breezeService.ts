
/**
 * ICICI BREEZE API CLIENT
 */

const DEFAULT_PROXY_URL = "https://breeze-proxy-919207294606.us-west1.run.app";

interface BreezeQuote {
  last_traded_price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  volume: number;
}

interface BreezeHistorical {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const resolveApiUrl = (endpoint: string) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let base = localStorage.getItem('breeze_proxy_url') || DEFAULT_PROXY_URL;
  
  if (base) {
    base = base.trim().replace(/\/$/, "");
    if (!base.startsWith('http')) {
      base = `https://${base}`;
    }
    return `${base}${path}`;
  }

  return `${DEFAULT_PROXY_URL}${path}`;
};

export const checkProxyHealth = async () => {
  const apiUrl = resolveApiUrl(`/api/breeze/health`);
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) return { ok: false, error: 'Proxy unreachable' };
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'Non-JSON health response' };
    }
  } catch (e) {
    return { ok: false, error: 'Network error connecting to proxy' };
  }
};

export const setDailyBreezeSession = async (apiSession: string, adminKey: string) => {
  const apiUrl = resolveApiUrl(`/api/breeze/admin/api-session`);
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Key": adminKey
    },
    body: JSON.stringify({ api_session: apiSession })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Gateway returned invalid response format");
  }
  
  if (!response.ok) throw new Error(json?.message || "Failed to set daily session");
  return json;
};

export const fetchBreezeNiftyQuote = async (): Promise<BreezeQuote> => {
  const apiUrl = resolveApiUrl(`/api/breeze/quotes`);
  const proxyKey = localStorage.getItem('breeze_proxy_key') || "";

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Key': proxyKey,
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      stock_code: 'NIFTY',
      exchange_code: 'NSE',
      product_type: 'cash'
    })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Breeze Proxy returned non-JSON.");
  }
  
  if (!response.ok) throw new Error(json.message || `Quote fetch failed: ${response.status}`);

  const row = Array.isArray(json.Success) ? json.Success.find((x: any) => x.exchange_code === "NSE") : null;
  
  if (!row) {
    throw new Error("No NSE quote row returned");
  }

  // Improved extraction logic for Indices: 
  const ltp = parseFloat(row.ltp || 0);
  const prevClose = parseFloat(row.previous_close || 0);
  // Indices often use 'chng' or 'net_change' or just 'change'
  const changeVal = parseFloat(row.change || row.chng || row.net_change || (ltp - prevClose) || 0);
  // Volume can be 'total_volume', 'DayVolume', or 'volume'
  const volumeVal = parseFloat(row.total_volume || row.volume || row.DayVolume || 0);

  return {
    last_traded_price: ltp,
    change: changeVal,
    percent_change: parseFloat(row.ltp_percent_change || row.chng_per || 0),
    open: parseFloat(row.open || 0),
    high: parseFloat(row.high || 0),
    low: parseFloat(row.low || 0),
    previous_close: prevClose,
    volume: volumeVal
  };
};

export const fetchBreezeHistoricalData = async (date: string): Promise<BreezeHistorical> => {
  const apiUrl = resolveApiUrl(`/api/breeze/historical`);
  const proxyKey = localStorage.getItem('breeze_proxy_key') || "";

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Key': proxyKey,
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      date,
      stock_code: 'NIFTY',
      exchange_code: 'NSE',
      product_type: 'cash'
    })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Historical Proxy returned non-JSON.");
  }
  
  if (!response.ok) throw new Error(json.message || `Historical Proxy error: ${response.status}`);

  const rows = json.Success;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No historical data found for ${date}`);
  }

  const r = rows[rows.length - 1]; 
  return {
    date,
    open: parseFloat(r.open),
    high: parseFloat(r.high),
    low: parseFloat(r.low),
    close: parseFloat(r.close),
    volume: parseFloat(r.volume || 0)
  };
};
