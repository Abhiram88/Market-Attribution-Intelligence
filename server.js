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

// 1. Comprehensive CORS - allow all origins in preview environments
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-SessionToken', 'X-Proxy-Key', 'Accept', 'Authorization']
}));

app.use(express.json());

// 2. Security Check
app.use((req, res, next) => {
  if (req.path === '/api/breeze/health' || !req.path.startsWith('/api/')) {
    return next();
  }

  if (PROXY_API_KEY) {
    const clientKey = req.header("X-Proxy-Key");
    if (clientKey !== PROXY_API_KEY) {
      return res.status(401).json({ Success: false, message: "Unauthorized: Invalid or missing X-Proxy-Key header." });
    }
  }
  next();
});

// 3. Helper for Breeze Checksum and Fetch
// We use POST internally even for Breeze's 'GET' data endpoints because 
// Breeze expects a JSON body which modern fetch implementations (browser & node-fetch v3)
// often reject when used with the GET method.
const breezeRequest = async (path, sessionToken, payload = {}) => {
  if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
    throw new Error("Breeze Keys not configured on server.");
  }

  const payloadStr = JSON.stringify(payload);
  const time_stamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  
  const checksum = crypto
    .createHash("sha256")
    .update(time_stamp + payloadStr + BREEZE_SECRET_KEY)
    .digest("hex");

  const url = `https://api.icicidirect.com/breezeapi/api/v1${path}`;
  
  const options = {
    method: "POST", // Breeze supports POST for these endpoints to avoid GET-body limitations
    headers: {
      "Content-Type": "application/json",
      "X-Checksum": `token ${checksum}`,
      "X-Timestamp": time_stamp,
      "X-AppKey": BREEZE_APP_KEY,
      "X-SessionToken": sessionToken,
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

// 4. Endpoints
app.get('/api/breeze/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    keys_configured: !!(BREEZE_APP_KEY && BREEZE_SECRET_KEY),
    server_time: new Date().toISOString()
  });
});

// Client -> Proxy MUST use POST to send the body safely
app.post('/api/breeze/quotes', async (req, res) => {
  try {
    const sessionToken = req.header("X-SessionToken");
    if (!sessionToken) return res.status(401).json({ ok: false, message: "Missing X-SessionToken" });

    const payload = req.body;
    const data = await breezeRequest('/quotes', sessionToken, {
      stock_code: payload.stock_code || "NIFTY",
      exchange_code: payload.exchange_code || "NSE",
      product_type: payload.product_type || "cash",
      ...payload // Support additional params like expiry_date, right, strike_price for F&O
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Proxy error" });
  }
});

app.post('/api/breeze/historical', async (req, res) => {
  try {
    const sessionToken = req.header("X-SessionToken");
    if (!sessionToken) return res.status(401).json({ ok: false, message: "Missing X-SessionToken" });

    const payload = req.body;
    if (!payload.date) return res.status(400).json({ ok: false, message: "Missing date" });

    const from_to = `${payload.date}T07:00:00.000Z`;

    const data = await breezeRequest('/historicalcharts', sessionToken, {
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