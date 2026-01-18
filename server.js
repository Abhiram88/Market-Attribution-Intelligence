
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

// --- ATTACHMENT PARSER ---
// This endpoint conversion HTML/iXBRL to clean text.
// GET version for easy debugging in a browser tab
app.get('/api/attachment/parse', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.send("Please provide a ?url= parameter");
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    res.send(text);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST version used by the frontend
app.post('/api/attachment/parse', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    console.log(`[Proxy] Fetching NSE Document: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.nseindia.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`NSE Archives responded with ${response.status}`);
    }

    const html = await response.text();
    
    // Cleanup HTML to get searchable text
    const text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    console.log(`[Proxy] Extraction complete. Chars: ${text.length}`);
    res.json({ text });
  } catch (err) {
    console.error(`[Proxy] Parser Failure:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

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

app.post('/api/breeze/quotes', async (req, res) => {
  try {
    const data = await breezeRequest('/customerdetails/quotes', req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/breeze/historical', async (req, res) => {
  try {
    const { date, stock_code, exchange_code, product_type } = req.body;
    const payload = {
      interval: '1day',
      from_date: `${date}T09:00:00.000Z`,
      to_date: `${date}T16:00:00.000Z`,
      stock_code,
      exchange_code,
      product_type
    };
    const data = await breezeRequest('/historicalcharts', payload);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.listen(port, () => {
  console.log(`Market Analysis Proxy active on port ${port}`);
});
