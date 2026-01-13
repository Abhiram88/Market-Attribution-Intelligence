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

// Helper for Breeze Checksum and Fetch
const breezeRequest = async (path, payload = {}) => {
  if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
    throw new Error("Breeze Keys (App/Secret) not configured on proxy server.");
  }
  if (!BREEZE_SESSION_TOKEN) {
    throw new Error("Breeze Session Token not set on proxy. Please use the admin endpoint.");
  }

  const payloadStr = JSON.stringify(payload);
  const time_stamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  
  const checksum = crypto
    .createHash("sha256")
    .update(time_stamp + payloadStr + BREEZE_SECRET_KEY)
    .digest("hex");

  const url = `https://api.icicidirect.com/breezeapi/api/v1${path}`;
  
  const options = {
    method: "POST", 
    headers: {
      "Content-Type": "application/json",
      "X-Checksum": `token ${checksum}`,
      "X-Timestamp": time_stamp,
      "X-AppKey": BREEZE_APP_KEY,
      "X-SessionToken": BREEZE_SESSION_TOKEN,
    },
    body: payloadStr
  };

  const response = await fetch(url, options);
  const text = await response.text();
  
  if (!response.ok) {
    throw new Error(`Breeze API error: ${response.status} - ${text}`);
  }
  
  return JSON.parse(text);
};

// --- API ENDPOINTS ---

app.get('/api/breeze/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    keys_configured: !!(BREEZE_APP_KEY && BREEZE_SECRET_KEY),
    session_token_set: !!BREEZE_SESSION_TOKEN,
    server_time: new Date().toISOString()
  });
});

// Admin endpoint to set the daily session token
app.post('/api/breeze/admin/api-session', (req, res) => {
  const adminKey = req.header("X-Proxy-Key");
  if (PROXY_API_KEY && adminKey !== PROXY_API_KEY) {
    return res.status(401).json({ ok: false, message: "Invalid Admin Key" });
  }
  
  const { api_session } = req.body;
  if (!api_session) return res.status(400).json({ ok: false, message: "Missing api_session" });
  
  BREEZE_SESSION_TOKEN = api_session;
  res.json({ ok: true, message: "Daily session token updated successfully." });
});

app.post('/api/breeze/quotes', async (req, res) => {
  try {
    const payload = req.body;
    const data = await breezeRequest('/quotes', {
      stock_code: payload.stock_code || "NIFTY",
      exchange_code: payload.exchange_code || "NSE",
      product_type: payload.product_type || "cash",
      ...payload 
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Proxy error" });
  }
});

app.post('/api/breeze/historical', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.date) return res.status(400).json({ ok: false, message: "Missing date" });

    const from_to = `${payload.date}T07:00:00.000Z`;

    const data = await breezeRequest('/historicalcharts', {
      interval: payload.interval || "1day",
      from_date: from_to,
      to_date: from_to,
      stock_code: payload.stock_code || "NIFTY",
      exchange_code: payload.exchange_code || "NSE",
      product_type: payload.product_type || "cash"
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Proxy error" });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`IQ Server Active on port ${port}`);
});