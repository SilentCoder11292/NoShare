import { useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes in ms

export default function useHealthCheck() {
  useEffect(() => {
    const pingBackend = () => {
      fetch(`${BACKEND_URL}/health`, { cache: 'no-store' })
        .then(() => console.log('[KEEP-ALIVE] Silent ping sent successfully'))
        .catch((err) => console.warn('[KEEP-ALIVE] Silent ping failed', err));
    };

    // Send immediate ping on load to wake up the server if it's sleeping
    pingBackend();

    // Set interval to send pings every 10 minutes to prevent sleeping
    const intervalId = setInterval(pingBackend, KEEP_ALIVE_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);
}
