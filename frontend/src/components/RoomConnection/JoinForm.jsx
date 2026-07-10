import React, { useState } from 'react';

export default function JoinForm({ onJoin }) {
  const [roomCode, setRoomCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onJoin(roomCode);
  };

  return (
    <form onSubmit={handleSubmit} className="connection-form">
      <div className="input-group">
        <input
          type="text"
          maxLength={6}
          placeholder="000000"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
          required
          autoFocus
          aria-label="6-digit Room Code"
        />
      </div>
      <button type="submit" className="btn-primary">
        Connect to Room
      </button>
    </form>
  );
}
