import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuthStore } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { WsEvent } from '@djs/shared';

export default function JobExplorer() {
  const { activeProject } = useAuthStore();
  const [jobs, setJobs] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const socket = useWebSocket();

  const fetchQueues = async () => {
    if (!activeProject) return;
    try {
      const res = await api.get(`/projects/${activeProject.id}/queues`);
      setQueues(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchJobs = async () => {
    if (!activeProject) return;
    try {
      const statusParam = statusFilter ? `&status=${statusFilter}` : '';
      const queueParam = queueFilter ? `&queueId=${queueFilter}` : '';
      const res = await api.get(`/projects/${activeProject.id}/jobs?limit=10&page=${currentPage}${statusParam}${queueParam}`);
      setJobs(res.data.data);
      setTotalPages(res.data.meta?.totalPages || 1);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, [activeProject]);

  useEffect(() => {
    fetchJobs();
  }, [activeProject, statusFilter, queueFilter, currentPage]);

  useEffect(() => {
    if (!socket || !activeProject) return;

    socket.emit('subscribe:project', activeProject.id);

    const handleJobChange = () => {
      fetchJobs();
    };

    socket.on(WsEvent.JOB_STATUS_CHANGED, handleJobChange);
    socket.on(WsEvent.JOB_CREATED, handleJobChange);

    return () => {
      socket.off(WsEvent.JOB_STATUS_CHANGED, handleJobChange);
      socket.off(WsEvent.JOB_CREATED, handleJobChange);
    };
  }, [socket, activeProject, statusFilter, queueFilter, currentPage]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Job Explorer</h1>
      </div>

      <div className="glass-panel" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Queue</label>
          <select
            value={queueFilter}
            onChange={(e) => { setQueueFilter(e.target.value); setCurrentPage(1); }}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid var(--panel-border)',
              background: 'var(--panel-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Queues</option>
            {queues.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid var(--panel-border)',
              background: 'var(--panel-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="claimed">Claimed</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="dead">Dead (DLQ)</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Queue</th>
              <th>Type</th>
              <th>Status</th>
              <th>Run At</th>
              <th>Attempts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{j.id.split('-')[0]}...</td>
                <td style={{ fontWeight: 500 }}>
                  <Link to={`/queues/${j.queue_id}`} style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>
                    {j.queue_name || 'unknown'}
                  </Link>
                </td>
                <td>{j.type}</td>
                <td>
                  <span className={`badge badge-${j.status}`}>{j.status}</span>
                </td>
                <td>{new Date(j.run_at).toLocaleString()}</td>
                <td>{j.attempt_count} / {j.max_attempts}</td>
                <td>
                  <Link to={`/jobs/${j.id}`} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>View Details</Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No jobs found matching the criteria.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '1rem', borderTop: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Page {currentPage} of {totalPages}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
