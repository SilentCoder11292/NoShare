import { useState, useEffect, useRef } from 'react';
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

const CHUNK_SIZE = 64 * 1024;
const BUFFER_THRESHOLD = 1024 * 1024;
const BUFFER_LOW_THRESHOLD = 256 * 1024;

export default function useWebRTC() {
  const [status, setStatus] = useState('disconnected');
  const [role, setRole] = useState(null);
  const [joinedRoom, setJoinedRoom] = useState('');
  const [webrtcState, setWebrtcState] = useState('new');
  const [dataChannelStatus, setDataChannelStatus] = useState('closed');
  const [connectionType, setConnectionType] = useState('Determining...');
  const [fileQueue, setFileQueue] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [transferringFile, setTransferringFile] = useState(null);
  const [pendingIncomingFile, setPendingIncomingFile] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('0.00');
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const isLegacyMode = !('showSaveFilePicker' in window);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const roleRef = useRef(null);
  const joinedRoomRef = useRef('');
  const pendingCandidates = useRef([]);
  const fileQueueRef = useRef([]);
  const statsIntervalRef = useRef(null);

  const resolveBufferedAmountLow = useRef(null);
  const ackResolver = useRef(null);
  const readyResolver = useRef(null);
  const isTransferring = useRef(false);
  const isCancelled = useRef(false);

  const writableStreamRef = useRef(null);
  const fallbackBuffersRef = useRef([]);
  const receiverBytesTotal = useRef(0);
  const receiverBytesReceived = useRef(0);
  const receiverStartTime = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp, message, type }]);
  };

  const cleanupWebRTC = () => {
    addLog('Terminating peer connections...', 'warning');
    
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
    for (const cand of pendingCandidates.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        addLog(`ICE Candidate failed: ${err.message}`, 'error');
      }
    }
    pendingCandidates.current = [];
  };

  const readSlice = (file, start, end) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file.slice(start, end));
    });
  };

  const cancelTransfer = async () => {
    addLog('Transfer cancelled.', 'warning');
    isCancelled.current = true;
    
    if (channelRef.current && channelRef.current.readyState === 'open') {
      channelRef.current.send(JSON.stringify({ type: 'cancel' }));
    }

    if (writableStreamRef.current) {
      try {
        await writableStreamRef.current.abort();
      } catch (e) {}
      writableStreamRef.current = null;
    }
    fallbackBuffersRef.current = [];

    if (readyResolver.current) {
      readyResolver.current.reject(new Error('User cancelled'));
      readyResolver.current = null;
    }
    if (resolveBufferedAmountLow.current) {
      resolveBufferedAmountLow.current();
      resolveBufferedAmountLow.current = null;
    }

    resetTransferStates();
  };

  const sendQueue = async () => {
    if (isTransferring.current) return;
    isTransferring.current = true;
    isCancelled.current = false;

    const list = fileQueueRef.current;
    addLog(`Starting queue transfer (${list.length} files)...`, 'info');

    for (let i = 0; i < list.length; i++) {
      if (isCancelled.current) break;

      const file = list[i];
      setCurrentFileIndex(i);
      setTransferringFile({ name: file.name, size: file.size, mimeType: file.type });
      setTransferProgress(0);

      addLog(`Sending metadata: "${file.name}"`, 'info');
      
      const metadata = {
        type: 'metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      };
      
      if (!channelRef.current || channelRef.current.readyState !== 'open') {
        addLog('Transfer failed: Channel not open.', 'error');
        resetTransferStates();
        return;
      }
      channelRef.current.send(JSON.stringify(metadata));

      try {
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
      let offset = 0;

      while (offset < file.size) {
        if (isCancelled.current) return;

        if (!channelRef.current || channelRef.current.readyState !== 'open') {
          addLog('Transfer aborted: Channel closed.', 'error');
          resetTransferStates();
          return;
        }

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

          const percent = Math.floor((bytesSent / file.size) * 100);
          setTransferProgress(percent);

          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed > 0) {
            const speed = (bytesSent / (1024 * 1024)) / elapsed;
            setTransferSpeed(speed.toFixed(2));
          }
        } catch (err) {
          addLog(`Read error: ${err.message}`, 'error');
          resetTransferStates();
          return;
        }
      }

      if (isCancelled.current) break;

      channelRef.current.send(JSON.stringify({ type: 'eof' }));
      addLog('File bytes sent. Awaiting confirmation...', 'info');

      await new Promise((resolve) => {
        ackResolver.current = resolve;
      });
      addLog(`File received: "${file.name}"`, 'success');
    }

    addLog('Queue complete.', 'success');
    resetTransferStates();
  };

  const startConnectionTypePoll = (pc) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    
    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const stats = await pc.getStats();
        let activePairId = null;

        stats.forEach((report) => {
          if (report.type === 'transport') {
            activePairId = report.selectedCandidatePairId;
          }
        });

        if (!activePairId) {
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
              activePairId = report.id;
            }
          });
        }

        if (activePairId) {
          const pair = stats.get(activePairId);
          if (pair) {
            const remote = stats.get(pair.remoteCandidateId);
            const local = stats.get(pair.localCandidateId);

            const isRelay = (local && local.candidateType === 'relay') ||
                            (remote && remote.candidateType === 'relay');

            setConnectionType(isRelay ? 'Relayed (TURN)' : 'Direct (STUN)');
          }
        }
      } catch (e) {
        console.warn('ICE stats failure:', e);
      }
    }, 3000);
  };

  const acceptIncomingFile = async () => {
    if (!pendingIncomingFile) return;

    if (window.showSaveFilePicker) {
      try {
        addLog(`Requesting save destination for "${pendingIncomingFile.name}"...`, 'info');
        const handle = await window.showSaveFilePicker({
          suggestedName: pendingIncomingFile.name,
        });
        
        const writable = await handle.createWritable();
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

        if (channelRef.current && channelRef.current.readyState === 'open') {
          channelRef.current.send(JSON.stringify({ type: 'ready' }));
        }
        setPendingIncomingFile(null);
      } catch (err) {
        if (err.name === 'AbortError') {
          addLog('User rejected save file dialog.', 'warning');
          if (channelRef.current && channelRef.current.readyState === 'open') {
            channelRef.current.send(JSON.stringify({ type: 'error', message: 'User aborted save' }));
          }
        } else {
          addLog(`Save setup failed: ${err.message}`, 'error');
          if (channelRef.current && channelRef.current.readyState === 'open') {
            channelRef.current.send(JSON.stringify({ type: 'error', message: err.message }));
          }
        }
        resetTransferStates();
        setPendingIncomingFile(null);
      }
    } else {
      addLog(`Initiating buffer queue fallback for "${pendingIncomingFile.name}"`, 'warning');
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

  const declineIncomingFile = () => {
    if (!pendingIncomingFile) return;
    addLog(`Rejected incoming file "${pendingIncomingFile.name}"`, 'warning');
    if (channelRef.current && channelRef.current.readyState === 'open') {
      channelRef.current.send(JSON.stringify({ type: 'error', message: 'User declined transfer' }));
    }
    setPendingIncomingFile(null);
  };

  const setupDataChannel = (channel) => {
    channelRef.current = channel;
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    channel.onopen = () => {
      setDataChannelStatus('open');
      addLog('WebRTC data channel established.', 'success');
    };

    channel.onclose = () => {
      setDataChannelStatus('closed');
      addLog('WebRTC data channel closed.', 'warning');
      cleanupWebRTC();
    };

    channel.onerror = (e) => {
      addLog(`WebRTC channel error: ${e.message || 'unknown'}`, 'error');
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
            addLog(`Remote error: ${packet.message}`, 'error');
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
              readyResolver.current.reject(new Error('Peer cancelled'));
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
            setPendingIncomingFile(packet);
          } else if (packet.type === 'eof') {
            if (window.showSaveFilePicker && writableStreamRef.current) {
              try {
                await writableStreamRef.current.close();
                writableStreamRef.current = null;
                addLog('File written to disk successfully.', 'success');
                channel.send(JSON.stringify({ type: 'ack' }));
                setTransferProgress(100);
                setTransferringFile(null);
              } catch (err) {
                addLog(`File close error: ${err.message}`, 'error');
                resetTransferStates();
              }
            } else if (!window.showSaveFilePicker) {
              try {
                const blob = new Blob(fallbackBuffersRef.current, {
                  type: transferringFile?.mimeType || 'application/octet-stream',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = transferringFile?.name || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                addLog('Fallback download triggered.', 'success');
                channel.send(JSON.stringify({ type: 'ack' }));
                fallbackBuffersRef.current = [];
                setTransferProgress(100);
                setTransferringFile(null);
              } catch (err) {
                addLog(`Fallback compile error: ${err.message}`, 'error');
                resetTransferStates();
              }
            }
          }
        } catch (e) {
          addLog(`String data: ${event.data}`, 'info');
        }
      } else {
        const chunk = event.data;
        try {
          if (window.showSaveFilePicker && writableStreamRef.current) {
            await writableStreamRef.current.write(chunk);
          } else if (!window.showSaveFilePicker) {
            fallbackBuffersRef.current.push(chunk);
          } else {
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
          addLog(`Write chunk error: ${err.message}`, 'error');
          channel.send(JSON.stringify({ type: 'error', message: 'Disk write failure' }));
          cleanupWebRTC();
        }
      }
    };
  };

  const initPeerConnection = () => {
    addLog('Initializing WebRTC peer connection...', 'info');
    const pc = new RTCPeerConnection(PC_CONFIG);
    pcRef.current = pc;

    const timeout = setTimeout(() => {
      if (pc.iceGatheringState !== 'complete') {
        addLog('ICE gathering timed out. Handshaking...', 'warning');
      }
    }, 8000);

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        addLog('ICE gathering complete.', 'success');
      }
    };

    pc.onicecandidateerror = (event) => {
      if (event.errorCode === 701) {
        addLog('STUN/TURN connection unreachable.', 'warning');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        addLog('ICE dropped. Aborting transfer...', 'error');
        setErrorMsg('Peer disconnected. Transfer aborted.');
        cleanupWebRTC();
      }
    };

    pc.onconnectionstatechange = () => {
      setWebrtcState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        startConnectionTypePoll(pc);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setErrorMsg('Peer disconnected. Transfer aborted.');
        cleanupWebRTC();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', event.candidate);
      }
    };

    return pc;
  };

  const joinRoom = (code) => {
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg('Invalid room code format.');
      return;
    }
    setErrorMsg('');
    setStatus('joining');
    socketRef.current.emit('join-room', code);
  };

  const leaveRoom = () => {
    window.location.reload();
  };

  const addFiles = (files) => {
    setFileQueue((prev) => {
      const list = [...prev, ...files];
      fileQueueRef.current = list;
      addLog(`Added ${files.length} files to transfer queue.`, 'info');
      return list;
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  useEffect(() => {
    socketRef.current = io(BACKEND_URL, {
      autoConnect: true,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      addLog('Connected to signaling server.', 'success');
    });

    socket.on('connect_error', () => {
      setErrorMsg('Unable to connect to signaling server.');
      setStatus('disconnected');
    });

    socket.on('room-joined', ({ role, roomCode }) => {
      setRole(role);
      roleRef.current = role;
      setJoinedRoom(roomCode);
      joinedRoomRef.current = roomCode;
      setStatus(role === 'host' ? 'joined-waiting' : 'ready');
      addLog(`Room joined: ${roomCode} as ${role.toUpperCase()}`, 'success');
    });

    socket.on('ready', async () => {
      setStatus('ready');
      addLog('Ready to negotiate WebRTC connection.', 'success');
      
      if (roleRef.current === 'host') {
        const pc = initPeerConnection();
        const channel = pc.createDataChannel('noshare-channel', { ordered: true });
        setupDataChannel(channel);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', offer);
        } catch (err) {
          addLog(`SDP Offer error: ${err.message}`, 'error');
        }
      }
    });

    socket.on('offer', async (offer) => {
      const pc = initPeerConnection();
      pc.ondatachannel = (e) => {
        setupDataChannel(e.channel);
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processPendingCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', answer);
      } catch (err) {
        addLog(`SDP Offer error: ${err.message}`, 'error');
      }
    });

    socket.on('answer', async (answer) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates();
      } catch (err) {
        addLog(`SDP Answer error: ${err.message}`, 'error');
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          addLog(`ICE candidate error: ${e.message}`, 'error');
        }
      } else {
        pendingCandidates.current.push(candidate);
      }
    });

    socket.on('room-full', ({ roomCode }) => {
      setStatus('full');
      setErrorMsg(`Room ${roomCode} is full.`);
    });

    socket.on('error-msg', (msg) => {
      setErrorMsg(msg);
      if (status === 'joining') setStatus('disconnected');
    });

    socket.on('peer-disconnected', () => {
      cleanupWebRTC();
      setStatus('joined-waiting');
      addLog('Peer left the room. Awaiting connection...', 'warning');
    });

    socket.on('disconnect', () => {
      cleanupWebRTC();
      setStatus('disconnected');
    });

    return () => {
      cleanupWebRTC();
      socket.disconnect();
    };
  }, []);

  return {
    status,
    role,
    joinedRoom,
    webrtcState,
    dataChannelStatus,
    connectionType,
    fileQueue,
    currentFileIndex,
    transferringFile,
    pendingIncomingFile,
    transferProgress,
    transferSpeed,
    logs,
    errorMsg,
    joinRoom,
    leaveRoom,
    addFiles,
    sendQueue,
    cancelTransfer,
    acceptIncomingFile,
    declineIncomingFile,
    clearLogs,
    isLegacyMode
  };
}
