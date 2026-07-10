import React from 'react';

export default function RoomDetails({ roomCode, role, webrtcState, dataChannelStatus, connectionType }) {
  return (
    <div className="room-info">
      <div className="info-grid">
        <div className="info-item">
          <span className="label">Room:</span>
          <span className="value room-badge">{roomCode}</span>
        </div>
        
        <div className="info-item">
          <span className="label">Role:</span>
          <span className={`value role-badge ${role === 'host' ? 'host' : 'guest'}`}>
            {role === 'host' ? 'SENDER' : 'RECEIVER'}
          </span>
        </div>
        
        <div className="info-item">
          <span className="label">P2P Conn:</span>
          <span className={`status-dot webrtc-${webrtcState}`}></span>
          <span className="value capitalize">{webrtcState}</span>
        </div>
        
        <div className="info-item">
          <span className="label">Channel:</span>
          <span className={`status-dot channel-${dataChannelStatus}`}></span>
          <span className="value capitalize">{dataChannelStatus}</span>
        </div>

        {webrtcState === 'connected' && (
          <div className="info-item" style={{ gridColumn: 'span 2' }}>
            <span className="label" style={{ width: '90px' }}>Quality:</span>
            <span className="value font-bold" style={{ color: 'var(--color-primary)' }}>{connectionType}</span>
          </div>
        )}
      </div>
    </div>
  );
}
