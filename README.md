# NoShare

NoShare is a browser-based peer-to-peer file sharing project that streams files directly between devices using WebRTC. Instead of uploading files to a cloud server first, the transfer happens directly between browser tabs, meaning zero data is stored intermediately.

## Tech Stack
* **Frontend**: React (Vite), native browser WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`), and the File System Access API.
* **Backend**: Node.js, Express, Socket.io (used strictly for signaling to establish the WebRTC peer connection).

## How it works & Engineering Details

The main technical challenge with browser-based P2P transfers is handling large files (e.g., 10GB+) without crashing the browser's tab memory. NoShare solves this through a few specific design decisions:

### 1. Signaling
WebRTC peers cannot connect directly without first knowing each other's network routes (ICE candidates) and session descriptions (SDP). We use a minimal Node.js backend with Socket.io to relay this handshake metadata. Once the WebRTC peer connection is established, the signaling server is completely out of the data path, and all data travels directly client-to-client.

### 2. Chunked Streaming
Reading an entire multi-gigabyte file into browser memory causes instant crashes. NoShare reads the file on-demand in small `64KB` chunks using the browser's standard `File.slice()` API. These slices are sent sequentially as binary data over the `RTCDataChannel`.

### 3. Flow Control & Backpressure
If the sender transmits data faster than the receiver's network or disk write speed can handle, the WebRTC buffer fills up and crashes the channel.
To prevent this, the sender monitors the `bufferedAmount` on the `RTCDataChannel`. If the buffered data exceeds `1MB`, the reader thread is paused. It resumes only when the buffer drains below `512KB` (via the `bufferedamountlow` event).

### 4. Direct-to-Disk Saving
On the receiving side, holding incoming chunks in memory until the transfer completes would also trigger memory exhaustion. We use the browser's File System Access API (`showSaveFilePicker`) to obtain a writable file handle. Incoming chunks are written directly to the user's hard drive in real time, keeping the browser memory footprint extremely low and constant throughout the transfer.
