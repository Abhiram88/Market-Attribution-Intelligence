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
      return res.status(401).json({
        Success: false,
        message: "Unauthorized: Invalid or missing X-Proxy-Key header."
      });
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

// 4. FIXED Breeze Quotes Proxy (Per ICICI Breeze Spec v1.0)
app.get('/api/breeze/quotes', async (req, res) => {
  try {
    const sessionToken = req.header("X-SessionToken");
    if (!sessionToken) {
      return res.status(401).json({
        Success: false,
        message: "Missing X-SessionToken"
      });
    }

    if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
      return res.status(500).json({
        Success: false,
        message: "Server Configuration Error: Keys missing."
      });
    }

    const {
      stock_code = "NIFTY",
      exchange_code = "NFO",
      product_type = "futures",
      expiry_date,
      right = "others",
      strike_price = "0",
    } = req.query;

    if (!expiry_date) {
      return res.status(400).json({
        Success: false,
        message: "Missing expiry_date"
      });
    }

    // FIX #1: Correct Checksum Calculation per ICICI Breeze Documentation
    const payloadObj = {
      stock_code,
      exchange_code,
      product_type,
      expiry_date,
      right,
      strike_price
    };

    const payload = JSON.stringify(payloadObj);

    // Get ISO8601 timestamp with milliseconds
    const time_stamp = new Date().toISOString();

    // CORRECT: timestamp\r\n payload\r\n secret_key, then SHA256 -> Base64
    const raw_checksum = `${time_stamp}\r\n${payload}\r\n${BREEZE_SECRET_KEY}`;
    const checksum = crypto
      .createHash("sha256")
      .update(raw_checksum)
      .digest("base64"); // Base64, not hex

    console.log(`[Breeze Request] Checksum: ${checksum.substring(0, 20)}...`);

    // FIX #2: Use POST with JSON body (Breeze expects POST for quotes)
    const breezeResp = await fetch("https://api.icicidirect.com/breezeapi/api/v1/quotes", {
      method: "POST", // Changed from GET to POST
      headers: {
        "Content-Type": "application/json",
        "X-Checksum": `${checksum}`, // No "token" prefix
        "X-Timestamp": time_stamp,
        "X-AppKey": BREEZE_APP_KEY,
        "X-SessionToken": sessionToken,
      },
      body: payload // POST method supports body
    });

    const responseText = await breezeResp.text();

    // FIX #3: Better error diagnostics
    if (!breezeResp.ok) {
      console.error(`[Breeze API Error] Status: ${breezeResp.status}, Response: ${responseText}`);
      return res.status(breezeResp.status).json({
        Success: false,
        message: `Breeze API Error: ${breezeResp.status}`,
        details: responseText
      });
    }

    res.status(200).type("application/json").send(responseText);
  } catch (e) {
    console.error("[Proxy Fatal Error]", e.message);
    res.status(500).json({
      Success: false,
      message: `Internal Proxy Error: ${e.message}`,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Cloud Run Service active on port ${port}. Proxy Security: ${!!PROXY_API_KEY}`);
});