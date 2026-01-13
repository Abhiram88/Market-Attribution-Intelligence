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

// 1. Bulletproof CORS & Preflight Handler
app.use((req, res, next) => {
  const origin = req.get('Origin') || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-SessionToken, Authorization, X-Proxy-Key');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

app.use(express.json());

// 2. Security Middleware
app.use((req, res, next) => {
  if (req.path === '/api/breeze/health' || !req.path.startsWith('/api/')) {
    return next();
  }

  if (PROXY_API_KEY) {
    const clientKey = req.header("X-Proxy-Key");
    if (clientKey !== PROXY_API_KEY) {
      console.warn(`[Security] Unauthorized access attempt from ${req.ip}`);
      return res.status(401).json({ Success: false, message: "Unauthorized: Invalid or missing X-Proxy-Key header." });
    }
  }
  next();
});

// 3. Health & Status
app.get('/api/breeze/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'Operational', 
    keys_configured: !!(BREEZE_APP_KEY && BREEZE_SECRET_KEY),
    proxy_security_active: !!PROXY_API_KEY,
    server_time: new Date().toISOString()
  });
});

// 4. Corrected Breeze Quotes Proxy (Per ICICI Breeze Spec)
app.get('/api/breeze/quotes', async (req, res) => {
  try {
    const sessionToken = req.header("X-SessionToken");
    if (!sessionToken) return res.status(401).json({ Success: false, message: "Missing X-SessionToken" });

    if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
      return res.status(500).json({ Success: false, message: "Server Configuration Error: Keys missing." });
    }

    const {
      stock_code = "NIFTY",
      exchange_code = "NFO",
      product_type = "futures",
      expiry_date,
      right = "others",
      strike_price = "0",
    } = req.query;

    if (!expiry_date) return res.status(400).json({ Success: false, message: "Missing expiry_date" });

    // Payload reconstruction for checksum and body
    const payloadObj = { stock_code, exchange_code, expiry_date, product_type, right, strike_price };
    const payload = JSON.stringify(payloadObj);

    const time_stamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const checksum = crypto.createHash("sha256").update(time_stamp + payload + BREEZE_SECRET_KEY).digest("hex");

    const breezeResp = await fetch("https://api.icicidirect.com/breezeapi/api/v1/quotes", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Checksum": `token ${checksum}`,
        "X-Timestamp": time_stamp,
        "X-AppKey": BREEZE_APP_KEY,
        "X-SessionToken": sessionToken,
      },
      body: payload // Breeze expects payload in body for quotes GET
    });

    const text = await breezeResp.text();
    res.status(breezeResp.status).type("application/json").send(text);
  } catch (e) {
    console.error("[Proxy Fatal Error]", e);
    res.status(500).json({ Success: false, message: `Internal Proxy Error: ${e.message}` });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Cloud Run Service active on port ${port}. Proxy Security: ${!!PROXY_API_KEY}`);
});