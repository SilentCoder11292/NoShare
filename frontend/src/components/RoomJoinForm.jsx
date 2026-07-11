import React from 'react';

export default function RoomJoinForm({ onSubmit, roomCode, setRoomCode, status, errorMsg, isOnline, serverStatus }) {
  if (status !== 'disconnected') return null;

  const isDisabled = !isOnline || serverStatus !== 'online';

  let placeholderText = "Enter 6-digit room code";
  if (!isOnline) {
    placeholderText = "Internet connection offline...";
  } else if (serverStatus === 'checking') {
    placeholderText = "Checking signaling server...";
  } else if (serverStatus === 'waking-up') {
    placeholderText = "Waking up server (please wait)...";
  } else if (serverStatus === 'offline') {
    placeholderText = "Signaling server offline...";
  }

  return (
    <form onSubmit={onSubmit} className="connection-form">
      {errorMsg && (
        <div className="error-alert">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}
      <div className="input-group">
        <input
          type="text"
          maxLength={6}
          placeholder={placeholderText}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
          required
          autoFocus
          disabled={isDisabled}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={isDisabled}>
        Join Room
      </button>
    </form>
  );
}
