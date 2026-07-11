import React from 'react';

export default function RoomJoinForm({ onSubmit, roomCode, setRoomCode, status, errorMsg }) {
  if (status !== 'disconnected') return null;

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
  );
}
