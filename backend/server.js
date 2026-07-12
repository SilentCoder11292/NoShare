import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { getCorsOptions } from './config/cors.js';
import { registerSignalHandlers } from './sockets/signalHandler.js';
import http from 'node:http';
import https from 'node:https';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'ok', service: 'NoShare Production Signaling' });
});

const httpServer = createServer(app);

// Strict CORS restriction for Production Readiness
const io = new Server(httpServer, {
  cors: getCorsOptions(),
});

// Register WebRTC signaling handlers
registerSignalHandlers(io);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);

  // Keep-alive check: Send an external request to the server's own public URL every 14 minutes
  // to prevent Render's free tier from sleeping.
  if (process.env.NODE_ENV === 'production') {
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in ms
    const backendUrl = process.env.BACKEND_URL || 'https://noshare.onrender.com';

    const pingSelf = () => {
      try {
        const url = new URL('/health', backendUrl).href;
        const client = url.startsWith('https:') ? https : http;
        console.log(`[Keep-Alive] Pinging signaling server at ${url}...`);
        
        client.get(url, (res) => {
          console.log(`[Keep-Alive] Response received: ${res.statusCode}`);
        }).on('error', (err) => {
          console.error('[Keep-Alive] Request failed:', err.message);
        });
      } catch (e) {
        console.error('[Keep-Alive] Invalid backend URL:', backendUrl);
      }
    };

    // Ping once on startup and schedule every 14 minutes
    pingSelf();
    const intervalId = setInterval(pingSelf, PING_INTERVAL);
    if (typeof intervalId.unref === 'function') {
      intervalId.unref();
    }
  }
});
