/**
 * ICICI BREEZE API CLIENT
 */

interface BreezeQuote {
  last_traded_price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  volume: number;
  spot_price?: number;
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
  
  let base = localStorage.getItem('breeze_proxy_url') || "";
  
  const cloudRunUrl = (window as any).__BREEZE_PROXY_BASE__;
  if (!base && cloudRunUrl) {
    base = cloudRunUrl;
  }

  if (base) {
    base = base.trim().replace(/\/$/, "");
    if (!base.startsWith('http')) {
      base = `https://${base}`;
    }
    return `${base}${path}`;
  }

  const origin = window.location.origin;
  const isSandbox = origin.includes('usercontent.goog') || origin.includes('aistudio') || origin.includes('localhost');
  
  if (isSandbox) {
    return `${origin}${path}`;
  }

  return path;
};

export const fetchBreezeNiftyQuote = async (sessionToken: string): Promise<BreezeQuote> => {
  if (!sessionToken) throw new Error("BREEZE_TOKEN_MISSING");

  const apiUrl = resolveApiUrl(`/api/breeze/quotes`);
  const proxyKey = localStorage.getItem('breeze_proxy_key') || "";

  console.log(`[Breeze Ingest] Calling Proxy via POST: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SessionToken': sessionToken,
        'X-Proxy-Key': proxyKey,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        stock_code: 'NIFTY',
        exchange_code: 'NSE',
        product_type: 'cash'
      })
    });

    const json = await response.json();
    
    if (!response.ok) {
      throw new Error(json.message || `Proxy Server Error: ${response.status}`);
    }

    if (json.Status === 401) throw new Error("BREEZE_TOKEN_INVALID");

    const data = json.Success?.[0] || json.Success;
    if (!data) throw new Error(json.message || "No data returned from Breeze API.");

    return {
      last_traded_price: parseFloat(data.ltp || data.last_price || data.DayClose || 0),
      change: parseFloat(data.change || data.net_change || 0),
      percent_change: parseFloat(data.percent_change || data.ltp_percent_change || 0),
      open: parseFloat(data.open || 0),
      high: parseFloat(data.high || data.DayHigh || 0),
      low: parseFloat(data.low || data.DayLow || 0),
      previous_close: parseFloat(data.previous_close || data.prev_close || 0),
      volume: parseFloat(data.volume || data.DayVolume || 0)
    };
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error(`CONNECTION_ERROR: The Proxy Server is unreachable or blocked. Check Cloud Run URL and CORS settings.`);
    }
    throw error;
  }
};

export const fetchBreezeHistoricalData = async (sessionToken: string, date: string): Promise<BreezeHistorical> => {
  if (!sessionToken) throw new Error("BREEZE_TOKEN_MISSING");

  const apiUrl = resolveApiUrl(`/api/breeze/historical`);
  const proxyKey = localStorage.getItem('breeze_proxy_key') || "";

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SessionToken': sessionToken,
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

  const json = await response.json();
  
  if (!response.ok) {
    throw new Error(json.message || `Historical Proxy error: ${response.status}`);
  }

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