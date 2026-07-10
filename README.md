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
