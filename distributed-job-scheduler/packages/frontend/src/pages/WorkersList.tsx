import { useEffect, useState } from 'react';
import { api } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { WsEvent } from '@djs/shared';

export default function WorkersList() {
  const [workers, setWorkers] = useState<any[]>([]);
  const socket = useWebSocket();

  const fetchWorkers = async () => {
    try {
      const res = await api.get('/workers');
      setWorkers(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchWorkers();
    
    if (!socket) return;
    const updateWorkers = () => fetchWorkers();
    socket.on(WsEvent.WORKER_REGISTERED, updateWorkers);
    socket.on(WsEvent.WORKER_HEARTBEAT, updateWorkers);
    socket.on(WsEvent.WORKER_OFFLINE, updateWorkers);

    return () => {
      socket.off(WsEvent.WORKER_REGISTERED);
      socket.off(WsEvent.WORKER_HEARTBEAT);
      socket.off(WsEvent.WORKER_OFFLINE);
    }
  }, [socket]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Workers Fleet</h1>
      </div>

      <div className="glass-panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>ID / Hostname</th>
              <th>Status</th>
              <th>Load</th>
              <th>Last Heartbeat</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => {
               const statusColor = 
                  w.status === 'active' ? 'var(--status-completed)' :
                  w.status === 'idle' ? 'var(--status-running)' :
                  w.status === 'offline' ? 'var(--status-failed)' : 'var(--status-pending)';
               
               return (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{w.hostname}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      PID: {w.pid} | {w.id.split('-')[0]}...
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }}></div>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.875rem', fontWeight: 600 }}>{w.status}</span>
                      {w.isStale && w.status !== 'offline' && (
                        <span className="badge badge-dead" style={{ marginLeft: '0.5rem' }}>STALE</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ width: '100px', background: 'rgba(255,255,255,0.1)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                       <div style={{ 
                         width: `${Math.min(100, (w.current_job_count / w.concurrency) * 100)}%`, 
                         background: 'var(--accent-color)', 
                         height: '100%' 
                       }}></div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {w.current_job_count} / {w.concurrency} jobs
                    </div>
                  </td>
                  <td style={{ color: w.isStale ? 'var(--status-failed)' : 'inherit' }}>
                    {w.last_heartbeat_at ? new Date(w.last_heartbeat_at).toLocaleTimeString() : 'Never'}
                  </td>
                  <td>{w.version}</td>
                </tr>
              )
            })}
            {workers.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No workers connected</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
