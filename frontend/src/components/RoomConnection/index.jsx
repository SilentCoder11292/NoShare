import React from 'react';
import useWebRTC from '../../hooks/useWebRTC';
import JoinForm from './JoinForm';
import RoomDetails from './RoomDetails';
import IncomingRequest from './IncomingRequest';
import FileQueue from './FileQueue';
import TransferProgress from './TransferProgress';
import LogConsole from './LogConsole';

export default function RoomConnection() {
  const {
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
  } = useWebRTC();

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
        <h2>WebRTC P2P Transfer</h2>
        <p className="subtitle">Secure, Zero-Storage File Sharing</p>
      </div>

      {isLegacyMode && status === 'ready' && (
        <div className="error-alert warning-alert" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>Legacy mode active: Large files will buffer in memory.</span>
        </div>
      )}

      {errorMsg && (
        <div className="error-alert">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>{errorMsg}</span>
        </div>
      )}

      {status === 'disconnected' && (
        <JoinForm onJoin={joinRoom} />
      )}

      {status === 'joining' && (
        <div className="status-container">
          <div className="spinner"></div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Connecting to signaling channel...</p>
        </div>
      )}

      {(status === 'joined-waiting' || status === 'ready' || status === 'full') && (
        <div className="active-connection">
          <RoomDetails 
            roomCode={joinedRoom}
            role={role}
            webrtcState={webrtcState}
            dataChannelStatus={dataChannelStatus}
            connectionType={connectionType}
          />

          {status === 'joined-waiting' && (
            <div className="waiting-container">
              <div className="pulse-loader"></div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Waiting for peer to join...</p>
            </div>
          )}

          {dataChannelStatus === 'open' && (
            <div className="p2p-transfer-panel">
              <h3>Direct-to-Disk Transfers</h3>

              <IncomingRequest 
                pendingFile={pendingIncomingFile}
                onAccept={acceptIncomingFile}
                onDecline={declineIncomingFile}
                formatBytes={formatBytes}
              />

              <TransferProgress 
                transferringFile={transferringFile}
                currentFileIndex={currentFileIndex}
                fileQueueLength={fileQueue.length}
                transferProgress={transferProgress}
                transferSpeed={transferSpeed}
                onCancel={cancelTransfer}
                role={role}
              />

              {role === 'host' && (
                <FileQueue 
                  fileQueue={fileQueue}
                  onAddFiles={addFiles}
                  onSend={sendQueue}
                  transferringFile={transferringFile}
                  formatBytes={formatBytes}
                />
              )}

              {role === 'guest' && !transferringFile && !pendingIncomingFile && (
                <div className="receiver-waiting-card">
                  <div className="receiver-waiting-pulse"></div>
                  <p>Awaiting transfer requests from peer...</p>
                </div>
              )}
            </div>
          )}

          <button onClick={leaveRoom} className="btn-secondary" style={{ marginTop: '0.5rem' }}>
            Disconnect & Exit
          </button>
        </div>
      )}

      <LogConsole 
        logs={logs}
        onClear={clearLogs}
      />
    </div>
  );
}
