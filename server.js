
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

const BREEZE_APP_KEY = process.env.BREEZE_APP_KEY;
const BREEZE_SECRET_KEY = process.env.BREEZE_SECRET_KEY;
const PROXY_API_KEY = process.env.PROXY_API_KEY;

// Internal state for the daily session token
let BREEZE_SESSION_TOKEN = null;

app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-SessionToken', 'X-Proxy-Key', 'Accept', 'Authorization']
}));

app.use(express.json());

/**
 * BREEZE API REQUEST WRAPPER
 * Handles Checksum, Timestamp, and Session Headers.
 * Translates Proxy POSTs to Breeze GETs where necessary.
 */
const breezeRequest = async (apiPath, payload = {}, method = 'GET') => {
  if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
    throw new Error("Breeze Keys (App/Secret) not configured on proxy server.");
  }
  if (!BREEZE_SESSION_TOKEN) {
    throw new Error("Breeze Session Token not set on proxy. Please use the admin endpoint.");
  }

  const time_stamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  let url = `https://api.icicidirect.com/breezeapi/api/v1${apiPath}`;
  let body = null;
  let payloadStr = "";

  if (method === 'GET') {
    // Convert payload to query string for GET requests (Quotes/Historical)
    const params = new URLSearchParams(payload);
    url += `?${params.toString()}`;
    payloadStr = JSON.stringify(payload); // Breeze Checksum still uses JSON string of params even for GET
  } else {
    body = JSON.stringify(payload);
    payloadStr = body;
  }
  
  const checksum = crypto
    .createHash("sha256")
    .update(time_stamp + payloadStr + BREEZE_SECRET_KEY)
    .digest("hex");

  const options = {
    method: method, 
    headers: {
      "Content-Type": "application/json",
      "X-Checksum": `token ${checksum}`,
      "X-Timestamp": time_stamp,
      "X-AppKey": BREEZE_APP_KEY,
      "X-SessionToken": BREEZE_SESSION_TOKEN,
    }
  };

  if (body) options.body = body;

  console.log(`[Breeze Proxy] Requesting ${method} ${apiPath} for ${payload.stock_code || 'NIFTY'}`);

  const response = await fetch(url, options);
  const text = await response.text();
  
  if (!response.ok) {
    console.error(`[Breeze Proxy] API Error: ${response.status}`, text);
    throw new Error(`Breeze API error: ${response.status} - ${text}`);
  }
  
  return JSON.parse(text);
};

// --- BREEZE ENDPOINTS ---

app.get('/api/breeze/health', (req, res) => {
  res.json({ 
    ok: true, 
    session_token_set: !!BREEZE_SESSION_TOKEN,
    proxy_key_required: !!PROXY_API_KEY 
  });
});

app.post('/api/breeze/admin/api-session', (req, res) => {
  const { api_session } = req.body;
  const key = req.headers['x-proxy-key'];

  if (PROXY_API_KEY && key !== PROXY_API_KEY) {
    return res.status(401).json({ message: "Invalid Proxy Key" });
  }

  if (!api_session) return res.status(400).json({ message: "Session required" });
  
  BREEZE_SESSION_TOKEN = api_session;
  res.json({ message: "Breeze session token updated successfully" });
});

/**
 * QUOTES ENDPOINT
 * ICICI expects a GET for customerdetails/quotes
 */
app.post('/api/breeze/quotes', async (req, res) => {
  try {
    // We map the incoming POST body to a Breeze GET call
    const data = await breezeRequest('/customerdetails/quotes', req.body, 'GET');
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * HISTORICAL ENDPOINT
 * ICICI expects a GET for historicalcharts
 */
app.post('/api/breeze/historical', async (req, res) => {
  try {
    const { from_date, to_date, stock_code, exchange_code, product_type, interval = '1day' } = req.body;
    const payload = {
      interval: interval,
      from_date: from_date.includes('T') ? from_date : `${from_date}T09:00:00.000Z`,
      to_date: to_date.includes('T') ? to_date : `${to_date}T16:00:00.000Z`,
      stock_code,
      exchange_code,
      product_type
    };
    const data = await breezeRequest('/historicalcharts', payload, 'GET');
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- ATTACHMENT PARSER ---
app.post('/api/attachment/parse', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nseindia.com/'
      }
    });

    if (!response.ok) throw new Error(`NSE Archives error: ${response.status}`);

    const html = await response.text();
    const text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Market Analysis Proxy active on port ${port}`);
});
