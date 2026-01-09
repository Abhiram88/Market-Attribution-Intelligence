
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(__dirname));

// Simplified server: Only serves static files and handles SPA routing.
// All intelligence and research logic is now client-side to ensure user control and API key security.

app.get('*.tsx', (req, res) => {
  res.set('Content-Type', 'text/javascript');
  res.sendFile(path.join(__dirname, req.path));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Intelligence Engine Static Server listening on port ${port}`);
});
