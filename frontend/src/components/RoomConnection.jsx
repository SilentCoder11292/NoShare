import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:5000';
const PC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { 
      urls: 'turn:global.turn.twilio.com:3478', 
      username: 'TURN_USER', 
      credential: 'TURN_PASSWORD' 
    }
  ],
  iceCandidatePoolSize: 10
};

const CHUNK_SIZE = 64 * 1024; // 64KB binary chunk size
const BUFFER_THRESHOLD = 1024 * 1024; // 1MB buffer ceiling
const BUFFER_LOW_THRESHOLD = 256 * 1024; // 256KB buffer floor

export default function RoomConnection() {
  // Connection states
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('disconnected'); // disconnected, joining, joined-waiting, ready, full
  const [role, setRole] = useState(null); // 'host' (sender) or 'guest' (receiver)
  const [joinedRoom, setJoinedRoom] = useState('');
  
  // WebRTC States
  const [webrtcState, setWebrtcState] = useState('new');
  const [dataChannelStatus, setDataChannelStatus] = useState('closed');
  const [connectionType, setConnectionType] = useState('Determining...');
  
  // File Sharing Queue & Progress states
  const [fileQueue, setFileQueue] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [transferringFile, setTransferringFile] = useState(null); // { name, size, mimeType }
  const [pendingIncomingFile, setPendingIncomingFile] = useState(null); // staged metadata waiting for user accept click
  const [transferProgress, setTransferProgress] = useState(0); // 0-100
  const [transferSpeed, setTransferSpeed] = useState('0.00'); // MB/s
  const [dragActive, setDragActive] = useState(false);
  const [isLegacyMode] = useState(!window.showSaveFilePicker);

  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Refs to avoid stale closures in socket and data channel handlers
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const roleRef = useRef(null);
  const joinedRoomRef = useRef('');
  const pendingCandidates = useRef([]);
  const fileQueueRef = useRef([]);

  // Signaling loop refs
  const resolveBufferedAmountLow = useRef(null);
  const ackResolver = useRef(null);
  const readyResolver = useRef(null);
  const isTransferring = useRef(false);
  const isCancelled = useRef(false);

  // Receiver stream state refs
  const writableStreamRef = useRef(null);
  const fallbackBuffersRef = useRef([]);
  const receiverBytesTotal = useRef(0);
  const receiverBytesReceived = useRef(0);
  const receiverStartTime = useRef(null);
  
  // Stats interval ref
  const statsIntervalRef = useRef(null);

  // Sync state with refs
  const setRoleAndRef = (val) => {
    setRole(val);
    roleRef.current = val;
  };

  const setJoinedRoomAndRef = (val) => {
    setJoinedRoom(val);
    joinedRoomRef.current = val;
  };

  // Helper to add logs to our UI console
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp, message, type }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const cleanupWebRTC = () => {
    addLog('Cleaning up WebRTC connections...', 'info');
    
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    setConnectionType('Determining...');
    setPendingIncomingFile(null);

    if (channelRef.current) {
      channelRef.current.close();
      channelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setDataChannelStatus('closed');
    setWebrtcState('new');
    pendingCandidates.current = [];
    
    // Close receiver write stream if open
    if (writableStreamRef.current) {
      try {
        writableStreamRef.current.close();
      } catch (e) {}
      writableStreamRef.current = null;
    }
    fallbackBuffersRef.current = [];
    
    resetTransferStates();
  };

  const resetTransferStates = () => {
    isTransferring.current = false;
    isCancelled.current = false;
    ackResolver.current = null;
    readyResolver.current = null;
    resolveBufferedAmountLow.current = null;
    setTransferringFile(null);
    setTransferProgress(0);
    setTransferSpeed('0.00');
    setFileQueue([]);
    fileQueueRef.current = [];
  };

  const processPendingCandidates = async () => {
    if (!pcRef.current) return;
    addLog(`Processing ${pendingCandidates.current.length} queued ICE candidates.`, 'info');
    for (const cand of pendingCandidates.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        addLog(`Error adding queued ICE Candidate: ${err.message}`, 'error');
      }
    }
    pendingCandidates.current = [];
  };

  // Helper to read a chunk of file sequentially
  const readSlice = (file, start, end) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file.slice(start, end));
    });
  };

  // Manual Transfer Cancellation
  const handleCancelTransfer = async () => {
    addLog('Initiating manual transfer cancellation...', 'warning');
    isCancelled.current = true;
    
    // 1. Send cancel signal to peer
    if (channelRef.current && channelRef.current.readyState === 'open') {
      channelRef.current.send(JSON.stringify({ type: 'cancel' }));
    }

    // 2. Abort writable stream if receiving
    if (writableStreamRef.current) {
      try {
        await writableStreamRef.current.abort();
      } catch (e) {}
      writableStreamRef.current = null;
    }
    fallbackBuffersRef.current = [];

    // 3. Reject any pending handshake awaits
    if (readyResolver.current) {
      readyResolver.current.reject(new Error('Cancelled by user'));
      readyResolver.current = null;
    }
    if (resolveBufferedAmountLow.current) {
      resolveBufferedAmountLow.current();
      resolveBufferedAmountLow.current = null;
    }

    resetTransferStates();
  };

  // Sender File Transmission Loop
  const sendNextFileInQueue = async () => {
    if (isTransferring.current) return;
    isTransferring.current = true;
    isCancelled.current = false;

    const list = fileQueueRef.current;
    addLog(`Initiating transfer of ${list.length} file(s)...`, 'info');

    for (let i = 0; i < list.length; i++) {
      if (isCancelled.current) break;

      const file = list[i];
      setCurrentFileIndex(i);
      setTransferringFile({ name: file.name, size: file.size, mimeType: file.type });
      setTransferProgress(0);

      addLog(`Sending file metadata for "${file.name}"`, 'info');
      
      const metadata = {
        type: 'metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      };
      
      if (!channelRef.current || channelRef.current.readyState !== 'open') {
        addLog('Aborted transfer: Data channel closed.', 'error');
        resetTransferStates();
        return;
      }
      channelRef.current.send(JSON.stringify(metadata));

      // Wait for Receiver 'ready' handshake (User accepting click)
      try {
        addLog('Awaiting Receiver file save setup & accept click...', 'info');
        await new Promise((resolve, reject) => {
          readyResolver.current = { resolve, reject };
        });
      } catch (err) {
        addLog(`Transfer aborted: ${err.message}`, 'error');
        resetTransferStates();
        return;
      }

      if (isCancelled.current) break;

      let bytesSent = 0;
      const startTime = Date.now();

      // Chunk slicing loop
      let offset = 0;
      while (offset < file.size) {
        if (isCancelled.current) {
          addLog('Slicing loop halted: transfer cancelled.', 'warning');
          return;
        }

        if (!channelRef.current || channelRef.current.readyState !== 'open') {
          addLog('Aborted transfer: Data channel disconnected.', 'error');
          resetTransferStates();
          return;
        }

        // Backpressure check
        if (channelRef.current.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise((resolve) => {
            resolveBufferedAmountLow.current = resolve;
          });
        }

        const end = Math.min(offset + CHUNK_SIZE, file.size);
        try {
          const chunk = await readSlice(file, offset, end);
          channelRef.current.send(chunk);
          bytesSent += chunk.byteLength;
          offset = end;

          // Update Progress
          const percent = Math.floor((bytesSent / file.size) * 100);
          setTransferProgress(percent);

          // Calculate transmission speed
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed > 0) {
            const speed = (bytesSent / (1024 * 1024)) / elapsed;
            setTransferSpeed(speed.toFixed(2));
          }
        } catch (err) {
          addLog(`Error reading file segment: ${err.message}`, 'error');
          resetTransferStates();
          return;
        }
      }

      if (isCancelled.current) break;

      // Send End-of-File packet
      addLog(`Finished sending file bytes for "${file.name}". Emitting EOF...`, 'info');
      channelRef.current.send(JSON.stringify({ type: 'eof' }));

      // Wait for ACK
      addLog('Awaiting Receiver receipt acknowledgment...', 'info');
      await new Promise((resolve) => {
        ackResolver.current = resolve;
      });
      addLog(`Received ACK from Receiver for "${file.name}".`, 'success');
    }

    addLog('File transmission queue complete!', 'success');
    resetTransferStates();
  };

  // Poll connection quality stats to check direct vs relayed
  const startConnectionTypePoll = (pc) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    
    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const stats = await pc.getStats();
        let activeCandidatePairId = null;

        stats.forEach((report) => {
          if (report.type === 'transport') {
            activeCandidatePairId = report.selectedCandidatePairId;
          }
        });

        if (!activeCandidatePairId) {
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
              activeCandidatePairId = report.id;
            }
          });
        }

        if (activeCandidatePairId) {
          const pairReport = stats.get(activeCandidatePairId);
          if (pairReport) {
            const remoteCandidateReport = stats.get(pairReport.remoteCandidateId);
            const localCandidateReport = stats.get(pairReport.localCandidateId);

            const isRelay = (localCandidateReport && localCandidateReport.candidateType === 'relay') ||
                            (remoteCandidateReport && remoteCandidateReport.candidateType === 'relay');

            setConnectionType(isRelay ? 'Relayed (TURN)' : 'Direct (STUN)');
          }
        }
      } catch (e) {
        console.warn('Failed to retrieve ICE stats:', e);
      }
    }, 3000);
  };

  // User gesture onClick handlers for Receiver Acceptance Flow
  const handleAcceptFile = async () => {
    if (!pendingIncomingFile) return;

    if (window.showSaveFilePicker) {
      try {
        addLog(`User accepted transfer. Prompting directory save dialog for "${pendingIncomingFile.name}"...`, 'info');
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: pendingIncomingFile.name,
        });
        
        addLog('Save file handle resolved. Creating writable file stream...', 'info');
        const writable = await fileHandle.createWritable();
        writableStreamRef.current = writable;

        setTransferringFile({ 
          name: pendingIncomingFile.name, 
          size: pendingIncomingFile.size, 
          mimeType: pendingIncomingFile.mimeType 
        });
        setTransferProgress(0);
        setTransferSpeed('0.00');
        receiverBytesTotal.current = pendingIncomingFile.size;
        receiverBytesReceived.current = 0;
        receiverStartTime.current = Date.now();

        // Send ready signal to sender
        addLog('Write stream initialized. Sending ready handshake packet...', 'success');
        if (channelRef.current && channelRef.current.readyState === 'open') {
          channelRef.current.send(JSON.stringify({ type: 'ready' }));
        }
        setPendingIncomingFile(null);
      } catch (err) {
        if (err.name === 'AbortError') {
          addLog('User cancelled the file save picker dialog.', 'warning');
          if (channelRef.current && channelRef.current.readyState === 'open') {
            channelRef.current.send(JSON.stringify({ type: 'error', message: 'User aborted save' }));
          }
        } else {
          addLog(`Failed to initialize save file stream: ${err.message}`, 'error');
          if (channelRef.current && channelRef.current.readyState === 'open') {
            channelRef.current.send(JSON.stringify({ type: 'error', message: err.message }));
          }
        }
        resetTransferStates();
        setPendingIncomingFile(null);
      }
    } else {
      // Legacy Mode Fallback buffering
      addLog(`User accepted legacy transfer. Legacy Mode buffering started for "${pendingIncomingFile.name}"`, 'warning');
      fallbackBuffersRef.current = [];

      setTransferringFile({ 
        name: pendingIncomingFile.name, 
        size: pendingIncomingFile.size, 
        mimeType: pendingIncomingFile.mimeType 
      });
      setTransferProgress(0);
      setTransferSpeed('0.00');
      receiverBytesTotal.current = pendingIncomingFile.size;
      receiverBytesReceived.current = 0;
      receiverStartTime.current = Date.now();

      if (channelRef.current && channelRef.current.readyState === 'open') {
        channelRef.current.send(JSON.stringify({ type: 'ready' }));
      }
      setPendingIncomingFile(null);
    }
  };

  const handleDeclineFile = () => {
    if (!pendingIncomingFile) return;
    addLog(`User declined incoming file: "${pendingIncomingFile.name}"`, 'warning');
    if (channelRef.current && channelRef.current.readyState === 'open') {
      channelRef.current.send(JSON.stringify({ type: 'error', message: 'User declined transfer' }));
    }
    setPendingIncomingFile(null);
  };

  // Setup WebRTC Data Channel Event Listeners
  const setupDataChannel = (channel) => {
    channelRef.current = channel;
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    channel.onopen = () => {
      setDataChannelStatus('open');
      addLog('RTCDataChannel is OPEN and ready for transfer!', 'success');
    };

    channel.onclose = () => {
      setDataChannelStatus('closed');
      addLog('RTCDataChannel has been closed.', 'warning');
      cleanupWebRTC();
    };

    channel.onerror = (error) => {
      addLog(`RTCDataChannel error: ${error.message || 'unknown error'}`, 'error');
    };

    channel.onbufferedamountlow = () => {
      if (resolveBufferedAmountLow.current) {
        resolveBufferedAmountLow.current();
        resolveBufferedAmountLow.current = null;
      }
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const packet = JSON.parse(event.data);
          
          if (packet.type === 'ready') {
            if (readyResolver.current) {
              readyResolver.current.resolve();
              readyResolver.current = null;
            }
          } else if (packet.type === 'error') {
            addLog(`Peer reported error: ${packet.message}`, 'error');
            setErrorMsg(`Transfer aborted: ${packet.message}`);
            if (readyResolver.current) {
              readyResolver.current.reject(new Error(packet.message));
              readyResolver.current = null;
            }
            resetTransferStates();
          } else if (packet.type === 'cancel') {
            addLog('Transfer cancelled by peer.', 'warning');
            
            if (writableStreamRef.current) {
              try {
                await writableStreamRef.current.abort();
              } catch (e) {}
              writableStreamRef.current = null;
            }
            fallbackBuffersRef.current = [];

            if (readyResolver.current) {
              readyResolver.current.reject(new Error('Cancelled by peer'));
              readyResolver.current = null;
            }
            if (resolveBufferedAmountLow.current) {
              resolveBufferedAmountLow.current();
              resolveBufferedAmountLow.current = null;
            }
            resetTransferStates();
          } else if (packet.type === 'ack') {
            if (ackResolver.current) {
              ackResolver.current();
              ackResolver.current = null;
            }
          } else if (packet.type === 'metadata') {
            // Stage incoming metadata in state to require click user-gesture
            addLog(`Incoming file request: "${packet.name}" (${formatBytes(packet.size)})`, 'info');
            setPendingIncomingFile(packet);
          } else if (packet.type === 'eof') {
            if (window.showSaveFilePicker && writableStreamRef.current) {
              try {
                addLog('EOF received. Closing disk write stream...', 'info');
                await writableStreamRef.current.close();
                writableStreamRef.current = null;
                addLog('File saved successfully to hard drive. Sending ACK...', 'success');
                channel.send(JSON.stringify({ type: 'ack' }));
                
                setTransferProgress(100);
                setTransferringFile(null);
              } catch (err) {
                addLog(`Error saving file stream: ${err.message}`, 'error');
                resetTransferStates();
              }
            } else if (!window.showSaveFilePicker) {
              try {
                addLog('EOF received. Compiling buffered slices into Blob...', 'info');
                const blob = new Blob(fallbackBuffersRef.current, {
                  type: transferringFile?.mimeType || 'application/octet-stream',
                });
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = transferringFile?.name || 'downloaded-file';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                addLog('Legacy download triggered. Sending ACK...', 'success');
                channel.send(JSON.stringify({ type: 'ack' }));
                fallbackBuffersRef.current = [];
                
                setTransferProgress(100);
                setTransferringFile(null);
              } catch (err) {
                addLog(`Legacy compilation error: ${err.message}`, 'error');
                resetTransferStates();
              }
            }
          }
        } catch (e) {
          addLog(`String packet received: ${event.data}`, 'info');
        }
      } else {
        const chunk = event.data;
        
        try {
          if (window.showSaveFilePicker && writableStreamRef.current) {
            await writableStreamRef.current.write(chunk);
          } else if (!window.showSaveFilePicker) {
            fallbackBuffersRef.current.push(chunk);
          } else {
            addLog('Warning: File stream is closed. Discarding incoming bytes.', 'warning');
            return;
          }

          receiverBytesReceived.current += chunk.byteLength;
          const total = receiverBytesTotal.current;
          if (total > 0) {
            const percent = Math.floor((receiverBytesReceived.current / total) * 100);
            setTransferProgress(percent);

            const elapsed = (Date.now() - receiverStartTime.current) / 1000;
            if (elapsed > 0) {
              const speed = (receiverBytesReceived.current / (1024 * 1024)) / elapsed;
              setTransferSpeed(speed.toFixed(2));
            }
          }
        } catch (err) {
          addLog(`Error writing chunk: ${err.message}`, 'error');
          channel.send(JSON.stringify({ type: 'error', message: 'Disk write failure' }));
          cleanupWebRTC();
        }
      }
    };
  };

  // Initialize WebRTC Peer Connection
  const initPeerConnection = () => {
    addLog('Initializing new RTCPeerConnection...', 'info');
    const pc = new RTCPeerConnection(PC_CONFIG);
    pcRef.current = pc;

    // A timeout of 8 seconds for ICE gathering progress safety
    const iceGatheringTimeout = setTimeout(() => {
      if (pc.iceGatheringState !== 'complete') {
        addLog('ICE candidate gathering timeout reached. Handshake continuing.', 'warning');
      }
    }, 8000);

    // Track ICE gathering state to clear timeout
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(iceGatheringTimeout);
        addLog('ICE candidate gathering complete.', 'success');
      }
    };

    // Listen for gathering errors
    pc.onicecandidateerror = (event) => {
      if (event.errorCode === 701) {
        addLog(`TURN server unreachable (Error 701: ${event.errorText})`, 'warning');
      }
    };

    // Track ICE connection state for drops
    pc.oniceconnectionstatechange = () => {
      addLog(`ICE Connection State: ${pc.iceConnectionState}`, 'info');
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        addLog('ICE Connection dropped. Aborting transfer...', 'error');
        setErrorMsg('Peer disconnected. Transfer aborted.');
        cleanupWebRTC();
      }
    };

    // Track Peer connection state for drops
    pc.onconnectionstatechange = () => {
      setWebrtcState(pc.connectionState);
      addLog(`WebRTC Connection State: ${pc.connectionState}`, 'info');
      if (pc.connectionState === 'connected') {
        startConnectionTypePoll(pc);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        addLog('Connection disconnected. Aborting transfer...', 'error');
        setErrorMsg('Peer disconnected. Transfer aborted.');
        cleanupWebRTC();
      }
    };

    // Gather local ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', event.candidate);
      }
    };

    return pc;
  };

  useEffect(() => {
    socketRef.current = io(BACKEND_URL, {
      autoConnect: true,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      addLog(`Connected to signaling server at ${BACKEND_URL}`, 'success');
    });

    socket.on('connect_error', (error) => {
      addLog(`Connection error: ${error.message}`, 'error');
      setErrorMsg('Failed to connect to signaling server.');
      setStatus('disconnected');
    });

    socket.on('room-joined', ({ role, roomCode }) => {
      setRoleAndRef(role);
      setJoinedRoomAndRef(roomCode);
      setStatus(role === 'host' ? 'joined-waiting' : 'ready');
      setErrorMsg('');
      addLog(`Joined room ${roomCode} as ${role.toUpperCase()}`, 'success');
    });

    socket.on('ready', async () => {
      setStatus('ready');
      setErrorMsg('');
      addLog('Both peers are connected to the room. Initiating WebRTC Handshake.', 'success');
      
      const currentRole = roleRef.current;
      if (currentRole === 'host') {
        const pc = initPeerConnection();
        const channel = pc.createDataChannel('noshare-channel', { ordered: true });
        setupDataChannel(channel);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', offer);
        } catch (err) {
          addLog(`Error creating SDP Offer: ${err.message}`, 'error');
        }
      }
    });

    socket.on('offer', async (offer) => {
      setErrorMsg('');
      addLog('SDP Offer received from peer.', 'success');
      const pc = initPeerConnection();

      pc.ondatachannel = (event) => {
        addLog('Inbound RTCDataChannel received from Sender.', 'success');
        setupDataChannel(event.channel);
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processPendingCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', answer);
      } catch (err) {
        addLog(`Error handling SDP Offer: ${err.message}`, 'error');
      }
    });

    socket.on('answer', async (answer) => {
      addLog('SDP Answer received from peer.', 'success');
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates();
      } catch (err) {
        addLog(`Error setting Remote Description (Answer): ${err.message}`, 'error');
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          addLog(`Error adding remote ICE Candidate: ${err.message}`, 'error');
        }
      } else {
        pendingCandidates.current.push(candidate);
      }
    });

    socket.on('room-full', ({ roomCode }) => {
      setStatus('full');
      setErrorMsg(`Room ${roomCode} is full (max 2 users).`);
      addLog(`Failed to join: Room ${roomCode} is full.`, 'error');
    });

    socket.on('error-msg', (msg) => {
      setErrorMsg(msg);
      addLog(`Server error: ${msg}`, 'error');
      if (status === 'joining') setStatus('disconnected');
    });

    socket.on('peer-disconnected', () => {
      cleanupWebRTC();
      setStatus('joined-waiting');
      addLog('Peer disconnected from room. Re-waiting for a new peer...', 'warning');
    });

    socket.on('disconnect', () => {
      cleanupWebRTC();
      addLog('Disconnected from signaling server.', 'warning');
      setStatus('disconnected');
    });

    return () => {
      cleanupWebRTC();
      socket.disconnect();
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(roomCode)) {
      setErrorMsg('Please enter a valid 6-digit room code.');
      return;
    }
    setErrorMsg('');
    setStatus('joining');
    socketRef.current.emit('join-room', roomCode);
  };

  const handleLeave = () => {
    window.location.reload();
  };

  // File drop/drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const addFilesToQueue = (files) => {
    setFileQueue((prev) => {
      const updated = [...prev, ...files];
      fileQueueRef.current = updated;
      addLog(`Added ${files.length} file(s) to queue. Total: ${updated.length}`, 'info');
      return updated;
    });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="connection-card">
      <div className="card-header">
        <h2>Phase 6: Prod Ready Stream</h2>
        <p className="subtitle">Security & NAT Traversal</p>
      </div>

      {isLegacyMode && (status === 'ready') && (
        <div className="error-alert warning-alert" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--color-warning)' }}>
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Legacy mode active: Large files may cause memory limits.</span>
        </div>
      )}

      {errorMsg && (
        <div className="error-alert">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {status === 'disconnected' && (
        <form onSubmit={handleJoin} className="connection-form">
          <div className="input-group">
            <input
              type="text"
              maxLength={6}
              placeholder="Enter 6-digit room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary">
            Join Room
          </button>
        </form>
      )}

      {status === 'joining' && (
        <div className="status-container">
          <div className="spinner"></div>
          <p>Contacting signaling server...</p>
        </div>
      )}

      {(status === 'joined-waiting' || status === 'ready' || status === 'full') && (
        <div className="active-connection">
          <div className="room-info">
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Room:</span>
                <span className="value room-badge">{joinedRoom || roomCode}</span>
              </div>
              <div className="info-item">
                <span className="label">Role:</span>
                <span className={`value role-badge ${role === 'host' ? 'host' : 'guest'}`}>
                  {role === 'host' ? 'SENDER (Host)' : 'RECEIVER (Guest)'}
                </span>
              </div>
              <div className="info-item">
                <span className="label">P2P Conn:</span>
                <span className={`status-dot webrtc-${webrtcState}`}></span>
                <span className="value capitalize font-bold">{webrtcState}</span>
              </div>
              <div className="info-item">
                <span className="label">Channel:</span>
                <span className={`status-dot channel-${dataChannelStatus}`}></span>
                <span className="value capitalize font-bold">{dataChannelStatus}</span>
              </div>
              {webrtcState === 'connected' && (
                <div className="info-item" style={{ gridColumn: 'span 2' }}>
                  <span className="label" style={{ width: '90px' }}>Connection Type:</span>
                  <span className="value font-bold" style={{ color: 'var(--color-primary)' }}>{connectionType}</span>
                </div>
              )}
            </div>
          </div>

          {status === 'joined-waiting' && (
            <div className="waiting-container">
              <div className="pulse-loader"></div>
              <p>Waiting for a peer to join...</p>
            </div>
          )}

          {dataChannelStatus === 'open' && (
            <div className="p2p-transfer-panel">
              <h3>P2P File Transfer</h3>

              {/* Incoming File Request Panel (Required User Gesture Trigger) */}
              {pendingIncomingFile && (
                <div className="progress-card incoming-request-card" style={{ borderColor: 'var(--color-primary)', background: 'rgba(59, 130, 246, 0.05)' }}>
                  <div className="progress-header">
                    <span className="progress-title" style={{ color: 'var(--color-primary)' }}>Incoming File Request</span>
                  </div>
                  <div style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
                    <strong>Name:</strong> {pendingIncomingFile.name} <br />
                    <strong>Size:</strong> {formatBytes(pendingIncomingFile.size)}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button onClick={handleAcceptFile} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      Accept & Save
                    </button>
                    <button onClick={handleDeclineFile} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'var(--color-error)' }}>
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Progress UI for Active Transmission */}
              {transferringFile && (
                <div className="progress-card">
                  <div className="progress-header">
                    <span className="progress-title" title={transferringFile.name}>
                      {transferringFile.name}
                    </span>
                    <span className="progress-queue-badge">
                      {role === 'host' 
                        ? `Sending ${currentFileIndex + 1} of ${fileQueue.length}` 
                        : 'Receiving...'}
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${transferProgress}%` }}></div>
                  </div>
                  <div className="progress-stats">
                    <span className="stat-speed">{transferSpeed} MB/s</span>
                    <span className="stat-percent">{transferProgress}%</span>
                  </div>
                  <button onClick={handleCancelTransfer} className="btn-secondary" style={{ marginTop: '0.5rem', color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                    Cancel Transfer
                  </button>
                </div>
              )}

              {/* Sender Interface */}
              {role === 'host' ? (
                <>
                  {!transferringFile && (
                    <div 
                      className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-input').click()}
                    >
                      <svg className="upload-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="drop-zone-text">Drag & drop files or click to choose</p>
                      <p className="drop-zone-subtext">Direct streaming, zero server uploads</p>
                      <input 
                        id="file-input" 
                        type="file" 
                        multiple 
                        className="file-input-hidden" 
                        onChange={handleFileSelect} 
                      />
                    </div>
                  )}

                  {fileQueue.length > 0 && !transferringFile && (
                    <>
                      <div className="queue-list-container">
                        <div className="queue-title">Queue ({fileQueue.length} files)</div>
                        {fileQueue.map((file, idx) => (
                          <div key={idx} className="queue-item">
                            <span className="queue-file-name" title={file.name}>{file.name}</span>
                            <span className="queue-file-size">{formatBytes(file.size)}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={sendNextFileInQueue} className="btn-primary">
                        Send Files
                      </button>
                    </>
                  )}
                </>
              ) : (
                /* Receiver Interface */
                !transferringFile && !pendingIncomingFile && (
                  <div className="receiver-waiting-card">
                    <div className="receiver-waiting-pulse"></div>
                    <p>Ready to receive files directly from peer...</p>
                  </div>
                )
              )}
            </div>
          )}

          <button onClick={handleLeave} className="btn-secondary">
            Leave Room
          </button>
        </div>
      )}

      <div className="console-panel">
        <div className="console-header">
          <span>Signaling & Flow logs</span>
          <button onClick={() => setLogs([])} className="btn-clear">Clear</button>
        </div>
        <div className="console-body">
          {logs.length === 0 ? (
            <div className="empty-logs">No logs yet. Join a room to start signaling.</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`log-line ${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

