import { checkJoinRateLimit } from '../middleware/rateLimiter.js';

export const registerSignalHandlers = (io) => {
  io.on('connection', (socket) => {
    // Join Room handler
    socket.on('join-room', (roomCode) => {
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
};
