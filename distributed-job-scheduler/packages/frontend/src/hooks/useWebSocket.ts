/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const s = io(import.meta.env.VITE_API_URL || '', {
      auth: { token },
      transports: ['websocket'],
    });

    s.on('connect', () => {
      console.log('WS Connected');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  return socket;
}
