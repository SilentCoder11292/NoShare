# NoShare — Zero-Storage P2P File Sharing

NoShare is a browser-based peer-to-peer file sharing application that streams files directly between devices using WebRTC. Files are never uploaded or saved to intermediate servers.

## Features

- **P2P Streaming**: Transfers file data directly between browser tabs using WebRTC `RTCDataChannel`.
- **Memory Efficient**: Reads and streams files in `64KB` chunks using `File.slice()`, allowing transfers of very large files (10GB+) without memory exhaustion.
- **Direct-to-Disk Saving**: Writes incoming chunks to the file system in real time via the browser's File System Access API (`showSaveFilePicker`).
- **Flow & Backpressure Control**: Automatically monitors `dataChannel.bufferedAmount` and pauses reader threads when buffer pressure exceeds `1MB`, resuming when buffer drains.
- **Security**: 
  - Socket.io connections are rate-limited to 10 join attempts per minute per IP to prevent brute-forcing.
  - Cors origins are explicitly restricted on the signaling server.
- **Double-Sided Keep-Alive**: 
  - Backend self-pings and frontend background pings prevent Render/Koyeb free tier instances from sleeping.
  - Active rooms automatically clean up after 1 hour of host inactivity.
  - Switching tabs or backgrounding/locking screen on mobile will not close active transfers; connections will automatically resume when returning.

## Architecture

```
[ Sender (Host) ]                                           [ Receiver (Guest) ]
       |                                                             |
       | ------ 1. Connect to Room (via Signaling Server) ---------- |
       |                                                             |
       | <----------------- 2. WebRTC Handshake -------------------> |
       |                                                             |
       | ------ 3. Metadata Header (File Name, Size, MIME) --------> |
       |                                                             |
       |                                                    [ Prompts User Accept ]
       |                                                    [ Resolves Save Picker]
       |                                                             |
       | <----- 4. Ready Handshake ('ready') ------------------------|
       |                                                             |
       | ====== 5. Binary Chunk Stream (64KB Slices) ===============>|
       |           (Monitored Backpressure Flow Control)             |
       |                                                             |
       | ====== 6. End-of-File ('eof') ----------------------------->|
       |                                                             |
       | <----- 7. Received Acknowledgment ('ack') ------------------|
```

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: React, Vite, WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`)

## Getting Started

### Prerequisites

- Node.js (v18+)

### Installation

1. **Clone repository**:
   ```bash
   git clone https://github.com/SilentCoder11292/NoShare.git
   cd NoShare
   ```

2. **Install dependencies**:
   * Backend:
     ```bash
     cd backend && npm install
     ```
   * Frontend:
     ```bash
     cd ../frontend && npm install
     ```

3. **Run locally**:
   * Start signaling server (port 5000):
     ```bash
     cd backend && npm run dev
     ```
   * Start Vite client (port 5173):
     ```bash
     cd ../frontend && npm run dev
     ```

## Production Deployment (Free Tier Keep-Alive)

Free-tier hosting platforms (such as Render or Koyeb) spin down backend instances after 15 minutes of inactivity. To prevent cold starts:

1. **Set Environment Variables** on your backend:
   - `BACKEND_URL`: The URL of your signaling server (e.g. `https://noshare-backend.onrender.com`).
   - `FRONTEND_URL` (optional): The URL of your frontend client.

2. **24/7 Warm Start**:
   - Register a free monitor at [UptimeRobot](https://uptimerobot.com/) or [cron-job.org](https://cron-job.org/) pointing to `https://<your-backend-url>/health` with a 10-minute check interval. This generates external traffic and keeps the server warm.
