import React from 'react';

export default function LogConsole({ logs, onClear }) {
  return (
    <div className="console-panel">
      <div className="console-header">
        <span>Signaling Logs</span>
        <button onClick={onClear} className="btn-clear" type="button">Clear</button>
      </div>
      <div className="console-body">
        {logs.length === 0 ? (
          <div className="empty-logs">Console idle. Join a room to start signaling.</div>
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
  );
}
