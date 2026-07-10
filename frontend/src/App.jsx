import React from 'react';
import RoomConnection from './components/RoomConnection';
import ThemeToggle from './components/ThemeToggle';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span className="logo-text">NoShare</span>
        </div>
        <div className="header-right">
          <span className="platform-badge">P2P Sharing</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="app-main">
        <div className="hero-section">
          <h1>Direct, Zero-Storage Peer-to-Peer File Sharing</h1>
          <p className="hero-subtitle">
            Establish a direct connection between two devices. No middleman. No cloud storage. 100% private.
          </p>
        </div>

        <RoomConnection />
      </main>

      <footer className="app-footer">
        <p>NoShare &copy; 2026. Handcrafted for performance and privacy.</p>
      </footer>
    </div>
  );
}

export default App;
