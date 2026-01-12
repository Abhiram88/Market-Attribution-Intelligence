
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

// 1. Enhanced CORS & Preflight Handler
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-SessionToken, Authorization, X-Proxy-Key');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// 2. Security Middleware: Optional Proxy Key Check
// If PROXY_API_KEY is set in the environment, all requests must provide a matching X-Proxy-Key header.
app.use((req, res, next) => {
  // We skip health check for easier debugging, or keep it secured too
  if (req.path === '/api/breeze/health') return next();

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

// 3. Health & Diagnostic Endpoint
app.get('/api/breeze/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'Operational', 
    keys_configured: !!(BREEZE_APP_KEY && BREEZE_SECRET_KEY),
    proxy_security_active: !!PROXY_API_KEY,
    server_time: new Date().toISOString()
  });
});

// 4. Breeze Proxy Logic
app.get('/api/breeze/quotes', async (req, res) => {
  try {
    const sessionToken = req.header("X-SessionToken");
    if (!sessionToken) {
      return res.status(401).json({ Success: false, message: "Missing X-SessionToken header" });
    }

    if (!BREEZE_APP_KEY || !BREEZE_SECRET_KEY) {
      return res.status(500).json({ 
        Success: false, 
        message: "Server Configuration Error: BREEZE_APP_KEY or BREEZE_SECRET_KEY is missing from environment variables." 
      });
    }

    const time_stamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const checksum = crypto.createHash("sha256").update(time_stamp + "" + BREEZE_SECRET_KEY).digest("hex");

    const queryParams = new URLSearchParams(req.query).toString();
    const targetUrl = `https://api.icicidirect.com/breezeapi/api/v1/quotes?${queryParams}`;

    const breezeResp = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Checksum": `token ${checksum}`,
        "X-Timestamp": time_stamp,
        "X-AppKey": BREEZE_APP_KEY,
        "X-SessionToken": sessionToken,
      }
    });

    const data = await breezeResp.json();
    res.status(breezeResp.status).json(data);
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
