import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'ok', service: 'NoShare Production Signaling' });
});

const httpServer = createServer(app);

// Strict CORS restriction for Production Readiness
const corsOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// Simple in-memory join-room socket rate limiter (limit: 10 attempts per minute per IP)
const ipRateLimiters = new Map(); // IP -> Array of timestamps

const checkJoinRateLimit = (ip) => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (!ipRateLimiters.has(ip)) {
    ipRateLimiters.set(ip, [now]);
    return true;
  }

  let timestamps = ipRateLimiters.get(ip);
  // Filter out timestamps older than the 1-minute window
  timestamps = timestamps.filter((t) => now - t < windowMs);
  timestamps.push(now);
  ipRateLimiters.set(ip, timestamps);

  return timestamps.length <= 10;
};

io.on('connection', (socket) => {
  // Join Room handler
  socket.on('join-room', (roomCode) => {
    // Basic rate limit check based on connection IP
    const clientIp = socket.handshake.address || socket.conn.remoteAddress || 'unknown-ip';
    if (!checkJoinRateLimit(clientIp)) {
      console.error(`Rate limit exceeded for join-room attempts from IP: ${clientIp}`);
      socket.emit('error-msg', 'Too many room connection attempts. Please wait one minute.');
      return;
    }

    // Validate 6-digit room code
    if (!/^\d{6}$/.test(roomCode)) {
      socket.emit('error-msg', 'Room code must be a 6-digit number.');
      return;
    }

    const room = io.sockets.adapter.rooms.get(roomCode);
    const numClients = room ? room.size : 0;

    if (numClients === 0) {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.emit('room-joined', { role: 'host', roomCode });
    } else if (numClients === 1) {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.emit('room-joined', { role: 'guest', roomCode });
      io.to(roomCode).emit('ready');
    } else {
      socket.emit('room-full', { roomCode });
    }
  });

  // WebRTC Signaling Pass-through: Offer
  socket.on('offer', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('offer', data);
    }
  });

  // WebRTC Signaling Pass-through: Answer
  socket.on('answer', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('answer', data);
    }
  });

  // WebRTC Signaling Pass-through: ICE Candidates
  socket.on('ice-candidate', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('ice-candidate', data);
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('peer-disconnected');
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
