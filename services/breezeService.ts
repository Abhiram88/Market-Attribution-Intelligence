
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

const resolveApiUrl = (endpoint: string) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // 1. Explicit user override (via modal)
  let base = localStorage.getItem('breeze_proxy_url') || "";
  
  // 2. Built-in global override (if provided via script injection)
  const cloudRunUrl = (window as any).__BREEZE_PROXY_BASE__;
  if (!base && cloudRunUrl) {
    base = cloudRunUrl;
  }

  if (base) {
    base = base.trim().replace(/\/$/, "");
    // Ensure protocol is present to avoid "Failed to fetch" on relative-looking strings
    if (!base.startsWith('http')) {
      base = `https://${base}`;
    }
    return `${base}${path}`;
  }

  // 3. Environment detection
  const origin = window.location.origin;
  const isPreview = origin.includes('localhost') || origin.includes('aistudio') || origin.includes('usercontent.goog');
  
  // If we are in production (on the Cloud Run URL itself), use relative paths
  if (!isPreview) {
    return path; 
  }

  // Fallback to absolute current origin
  return `${origin}${path}`;
};

export const fetchBreezeNiftyQuote = async (sessionToken: string): Promise<BreezeQuote> => {
  if (!sessionToken) throw new Error("BREEZE_TOKEN_MISSING");

  const now = new Date();
  const getLastThursday = (y: number, m: number) => {
    const d = new Date(y, m + 1, 0); 
    while (d.getDay() !== 4) d.setDate(d.getDate() - 1);
    return d;
  };
  let exp = getLastThursday(now.getFullYear(), now.getMonth());
  if (now > exp) exp = getLastThursday(now.getFullYear(), now.getMonth() + 1);
  const expiry_date = exp.toISOString().split('T')[0] + "T06:00:00.000Z";

  const params = new URLSearchParams({
    stock_code: 'NIFTY',
    exchange_code: 'NFO',
    product_type: 'futures',
    expiry_date,
    right: 'others',
    strike_price: '0'
  });

  const apiUrl = resolveApiUrl(`/api/breeze/quotes?${params.toString()}`);
  const proxyKey = localStorage.getItem('breeze_proxy_key') || "";

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-SessionToken': sessionToken,
        'X-Proxy-Key': proxyKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP Error ${response.status}`);
    }

    const json = await response.json();
    if (json.Status === 401) throw new Error("BREEZE_TOKEN_INVALID");

    const data = json.Success?.[0];
    if (!data) throw new Error(json.message || "Brokerage returned empty response");

    return {
      last_traded_price: parseFloat(data.spot_price || data.ltp || 0),
      change: parseFloat(data.change || 0),
      percent_change: parseFloat(data.percent_change || 0),
      open: parseFloat(data.open || 0),
      high: parseFloat(data.high || 0),
      low: parseFloat(data.low || 0),
      previous_close: parseFloat(data.previous_close || 0),
      volume: parseFloat(data.volume || 0)
    };
  } catch (error: any) {
    console.error(`[Breeze Network Fault] Target: ${apiUrl}`, error);
    
    if (error.name === 'TypeError') {
      // Diagnostic check: Test the health endpoint
      try {
        const healthUrl = resolveApiUrl('/api/breeze/health');
        const healthResponse = await fetch(healthUrl, { method: 'GET' });
        if (healthResponse.ok) {
          throw new Error("CORS or Security Blocked: The server is online but refused the request headers.");
        }
      } catch (hErr) {
        throw new Error(`Cloud Run Unreachable (${apiUrl}): Ensure the service is PUBLIC ('Allow Unauthenticated') and the URL is correct.`);
      }
      throw new Error("Network Pipeline Error: Check your firewall or browser connectivity.");
    }
    throw error;
  }
};
