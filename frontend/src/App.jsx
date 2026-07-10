import React from 'react';
import RoomConnection from './components/RoomConnection';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span className="logo-text">No<span className="accent">Share</span></span>
        </div>
        <div className="badge">Zero-Storage P2P</div>
      </header>

      <main className="app-main">
        <div className="hero-section">
          <h1>Zero-Storage Peer-to-Peer File Sharing</h1>
          <p className="hero-subtitle">
            Instantly connect two devices directly in your browser. No middleman. No cloud storage. Pure privacy.
          </p>
        </div>

        <RoomConnection />
      </main>

      <footer className="app-footer">
        <p>NoShare.com &copy; 2026. Phase 1 - Signaling Server matched.</p>
      </footer>
    </div>
  );
}

export default App;
