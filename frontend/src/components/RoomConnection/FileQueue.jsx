import React, { useState } from 'react';

export default function FileQueue({ fileQueue, onAddFiles, onSend, transferringFile, formatBytes }) {
  const [dragActive, setDragActive] = useState(false);

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
      onAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      onAddFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="file-queue-section">
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
          <p className="drop-zone-subtext">Direct streaming, zero cloud storage footprint</p>
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
        <div style={{ marginTop: '1.25rem' }}>
          <div className="queue-list-container">
            <div className="queue-title">Queue ({fileQueue.length} files)</div>
            {fileQueue.map((file, idx) => (
              <div key={idx} className="queue-item">
                <span className="queue-file-name" title={file.name}>{file.name}</span>
                <span className="queue-file-size">{formatBytes(file.size)}</span>
              </div>
            ))}
          </div>
          <button onClick={onSend} className="btn-primary" style={{ marginTop: '1rem' }}>
            Send Files
          </button>
        </div>
      )}
    </div>
  );
}
