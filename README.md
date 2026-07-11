# NoShare.com — Zero-Storage P2P File Sharing

NoShare is a high-performance, browser-based peer-to-peer file sharing platform designed for secure, direct transfers with **zero cloud footprint**. 

Unlike conventional sharing services, files transferred via NoShare are never stored on any server. Instead, devices establish a direct connection in the browser using WebRTC, transferring bytes directly from memory to memory.

## Key Features

- **Zero Cloud Storage**: Files are streamed directly between peers using `RTCDataChannel`. No files are uploaded, cached, or saved on intermediate servers.
- **Zero-RAM Slicing Loop**: Sequentially reads files in `64KB` blocks (`File.slice()`), preventing memory exhaustion crashes even when transmitting files up to `10GB+`.
- **Direct-to-Disk Streaming**: Automatically writes received chunks to the local hard drive in real time via the native `FileSystemWritableFileStream` API (`showSaveFilePicker`), bypassing RAM limits.
- **Network Resilience & Backpressure Control**:
  - Dynamically manages backpressure thresholds, pausing stream reads if `dataChannel.bufferedAmount` exceeds `1MB` and resuming once it drains.
  - Automatically aborts active handles and clears queues if WebRTC connection states transition to `disconnected` or `failed`.
- **Interactive Handshakes & User Gesture Security**: Prompts the receiver to explicitly Accept or Decline incoming transfers, invoking the save dialog securely within onClick bounds to satisfy modern browser security restrictions.
- **Production-Grade Security**:
  - Restricts signaling server access to authorized domains via CORS configurations.
  - Mitigates brute-forcing on room codes with Socket.io connection rate limiters (maximum 10 connections per minute per IP).
- **Responsive System Themes**: Features a premium light, dark, and system-adaptive visual theme pill toggle matching professional design guidelines.

## Technical Architecture

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

- **Backend**: Node.js, Express, Socket.io (Signaling & Room matching)
- **Frontend**: React (Vite), Native WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`)
- **Storage**: Native Browser File System Access API

## Getting Started

### Prerequisites

Ensure you have **Node.js** (v16+) installed.

### Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/SilentCoder11292/NoShare.git
   cd NoShare
   ```

2. **Install Dependencies**:
   - Backend:
     ```bash
     cd backend
     npm install
     ```
   - Frontend:
     ```bash
     cd ../frontend
     npm install
     ```

3. **Run Locally**:
   - Start backend server (port 5000):
     ```bash
     cd backend
     npm start
     ```
   - Start frontend Vite dev server (port 5173):
     ```bash
     cd ../frontend
     npm run dev
     ```

4. **Production Build**:
   ```bash
   npm run build
   ```

## Keep-Alive & Free-Tier Hosting (Render/Koyeb)

Free-tier hosting providers like Render and Koyeb put backend instances to sleep after 15 minutes of inactivity. To ensure a fast, seamless connection when users visit NoShare, we have implemented a double-sided keep-alive system:

1. **Frontend-to-Backend Keep-Alive**: While any user has the NoShare frontend page open in their browser, the frontend automatically sends a lightweight ping to the backend `/health` endpoint every 10 minutes, preventing it from spinning down.
2. **Backend Self-Pinging**: When started, the backend schedules a self-pinging routine using a native interval every 14 minutes. By sending a request to itself, it resets the Render inactivity timer.

### Configuration (Environment Variables)

To activate the keep-alive routines on your production deployment, configure the following environment variables in your backend service dashboard:

- `BACKEND_URL`: The URL of your backend signaling service (e.g., `https://noshare-signaling.onrender.com`). If set, the server will ping itself every 14 minutes.
- `FRONTEND_URL`: (Optional) The URL of your frontend client. If set, the backend will also ping the frontend to keep it warm if it runs on a web service.

### 24/7 Warm Start (Zero Cold Start Delay)

Even with self-pinging, if your backend server does spin down (e.g., after a new deployment or maintenance restart), it needs one initial request to wake up.

To keep it awake 24/7 with zero initial startup lag:
1. Sign up for a free account on [UptimeRobot](https://uptimerobot.com/) or [cron-job.org](https://cron-job.org/).
2. Create a new HTTP monitor pointing to your backend health endpoint: `https://your-backend-url.onrender.com/health`.
3. Set the check interval to **10 minutes**. This will ping your backend externally and keep it warm constantly.

