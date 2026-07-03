import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { WsEvent } from '@djs/shared';
import toast from 'react-hot-toast';

export default function QueueDetail() {
  const { queueId } = useParams();
  const [queue, setQueue] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [jobType, setJobType] = useState('send-email');
  const [jobDelay, setJobDelay] = useState(0);
  const [jobPriority, setJobPriority] = useState(5);
  const [jobPayload, setJobPayload] = useState('{\n  "to": "user@example.com",\n  "subject": "Hello World"\n}');
  const socket = useWebSocket();

  const fetchData = async () => {
    try {
      const [qRes, jRes, mRes] = await Promise.all([
        api.get(`/queues/${queueId}`),
        api.get(`/queues/${queueId}/jobs?limit=10`),
        api.get(`/queues/${queueId}/metrics?hours=1`),
      ]);
      setQueue(qRes.data.data);
      setJobs(jRes.data.data);
      
      const formattedMetrics = mRes.data.data.map((m: any) => ({
        time: format(new Date(m.captured_at), 'HH:mm'),
        throughput: m.throughput_per_minute,
        pending: m.pending_count,
        running: m.running_count,
        failed: m.failed_count
      }));
      setMetrics(formattedMetrics);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [queueId]);

  useEffect(() => {
    if (!socket || !queueId) return;

    socket.emit('subscribe:queue', queueId);

    const handleJobChange = () => {
      // Very naive approach: just refetch the top jobs when someone changes
      // In a real app we'd mutate the state
      api.get(`/queues/${queueId}/jobs?limit=10`).then(res => setJobs(res.data.data));
      api.get(`/queues/${queueId}`).then(res => setQueue(res.data.data));
    };

    socket.on(WsEvent.JOB_STATUS_CHANGED, handleJobChange);
    socket.on(WsEvent.JOB_CREATED, handleJobChange);
    
    return () => {
      socket.emit('unsubscribe:queue', queueId);
      socket.off(WsEvent.JOB_STATUS_CHANGED);
      socket.off(WsEvent.JOB_CREATED);
    };
  }, [socket, queueId]);
  const togglePause = async () => {
    try {
      if (queue.is_paused) {
        await api.post(`/queues/${queueId}/resume`);
        toast.success('Queue resumed');
      } else {
        await api.post(`/queues/${queueId}/pause`);
        toast.success('Queue paused');
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to toggle queue');
    }
  };

  const handleTriggerJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedPayload = {};
      try {
        if (jobPayload.trim()) {
          parsedPayload = JSON.parse(jobPayload);
        }
      } catch {
        toast.error('Invalid JSON payload');
        return;
      }

      const body: any = {
        type: jobType,
        payload: parsedPayload,
        priority: Number(jobPriority),
      };

      if (jobDelay > 0) {
        body.runAt = new Date(Date.now() + jobDelay * 1000).toISOString();
      }

      await api.post(`/queues/${queueId}/jobs`, body);
      toast.success('Job triggered successfully!');
      setIsTriggerModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to trigger job');
    }
  };

  if (!queue) return <div>Loading...</div>;  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <Link to="/queues" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '0.5rem', display: 'inline-block' }}>&larr; Back to Queues</Link>
          <h1 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {queue.name}
            <span className={`badge ${queue.is_paused ? 'badge-dead' : 'badge-completed'}`}>
              {queue.is_paused ? 'PAUSED' : 'ACTIVE'}
            </span>
          </h1>
        </div>
        <div>
          <button onClick={() => setIsTriggerModalOpen(true)} className="btn btn-primary" style={{ marginRight: '1rem' }}>
            Trigger Job
          </button>
          <Link to={`/queues/${queueId}/dlq`} className="btn btn-secondary" style={{ marginRight: '1rem', textDecoration: 'none' }}>
            View DLQ ({queue.stats.deadCount})
          </Link>
          <button onClick={togglePause} className="btn" style={{ background: queue.is_paused ? 'var(--status-completed)' : 'var(--status-failed)' }}>
            {queue.is_paused ? 'Resume Queue' : 'Pause Queue'}
          </button>
        </div>
      </div>

      <div className="grid-cards">
        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)' }}>Pending Jobs</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-pending)' }}>{queue.stats?.pendingCount || 0}</div>
        </div>
        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)' }}>Running Jobs</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-running)' }}>{queue.stats?.runningCount || 0}</div>
        </div>
        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)' }}>Throughput (1h)</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-completed)' }}>{queue.stats?.throughputPerMinute || 0}/min</div>
        </div>
        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)' }}>Error Rate (1h)</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: queue.stats?.errorRate > 0 ? 'var(--status-failed)' : 'var(--status-completed)' }}>
            {queue.stats?.errorRate || 0}%
          </div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '2rem', height: '300px' }}>
          <h3 style={{ marginBottom: '1rem' }}>Throughput History (Last Hour)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics}>
              <XAxis dataKey="time" stroke="var(--text-secondary)" />
              <YAxis stroke="var(--text-secondary)" />
              <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Area type="monotone" dataKey="throughput" stroke="var(--status-completed)" fill="rgba(52, 211, 153, 0.2)" />
              <Area type="monotone" dataKey="pending" stroke="var(--status-pending)" fill="rgba(251, 191, 36, 0.2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 0 }}>
        <h3 style={{ padding: '1.5rem', borderBottom: '1px solid var(--panel-border)', margin: 0 }}>Recent Jobs</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
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
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No recent jobs</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isTriggerModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '500px',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
            border: '1px solid var(--panel-border)'
          }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#fff' }}>Trigger Background Job</h2>
            <form onSubmit={handleTriggerJob}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Job Type</label>
                <input
                  type="text"
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="glass-panel"
                  style={{ width: '100%', padding: '0.75rem', color: '#fff', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.05)' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Delay (Seconds, 0 for immediate)</label>
                <input
                  type="number"
                  value={jobDelay}
                  onChange={(e) => setJobDelay(Number(e.target.value))}
                  className="glass-panel"
                  style={{ width: '100%', padding: '0.75rem', color: '#fff', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.05)' }}
                  min="0"
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Priority (1 - 10)</label>
                <select
                  value={jobPriority}
                  onChange={(e) => setJobPriority(Number(e.target.value))}
                  className="glass-panel"
                  style={{ width: '100%', padding: '0.75rem', color: '#fff', border: '1px solid var(--panel-border)', background: '#111827' }}
                >
                  {[...Array(10)].map((_, i) => (
                    <option key={i + 1} value={i + 1} style={{ background: '#111827' }}>{i + 1} (Priority)</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Payload (JSON)</label>
                <textarea
                  value={jobPayload}
                  onChange={(e) => setJobPayload(e.target.value)}
                  className="glass-panel"
                  style={{ width: '100%', height: '100px', padding: '0.75rem', color: '#fff', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.05)', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" onClick={() => setIsTriggerModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Trigger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
