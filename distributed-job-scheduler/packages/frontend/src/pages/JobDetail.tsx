import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../store/authStore';

export default function JobDetail() {
  const { jobId } = useParams();
  const [jobData, setJobData] = useState<any>(null);

  const fetchJob = async () => {
    try {
      const res = await api.get(`/jobs/${jobId}`);
      setJobData(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJob();
    const iv = setInterval(fetchJob, 5000);
    return () => clearInterval(iv);
  }, [jobId]);

  if (!jobData) return <div>Loading...</div>;

  return (
    <div>
      <Link to={`/queues/${jobData.queue_id}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>&larr; Back to Queue</Link>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          Job: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{jobData.id}</span>
          <span className={`badge badge-${jobData.status}`}>{jobData.status}</span>
        </h1>
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>Overview</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>Type:</span> {jobData.type}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Run At:</span> {new Date(jobData.run_at).toLocaleString()}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Attempts:</span> {jobData.attempt_count} / {jobData.max_attempts}</div>
            {jobData.failure_reason && (
              <div>
                <span style={{ color: 'var(--status-failed)' }}>Error:</span> 
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px', marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {jobData.failure_reason}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>Payload</h3>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {JSON.stringify(jobData.payload, null, 2)}
          </pre>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>Execution Logs</h3>
        {jobData.logs?.length > 0 ? (
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {jobData.logs.map((log: any) => (
              <div key={log.id} style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(log.logged_at).toISOString()}</span>
                <span style={{ 
                  color: log.level === 'error' ? 'var(--status-failed)' : 
                         log.level === 'warn' ? 'var(--status-pending)' : 
                         'var(--status-running)',
                  fontWeight: 'bold',
                  width: '50px'
                }}>
                  [{log.level.toUpperCase()}]
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)' }}>No logs available for this job.</div>
        )}
      </div>
    </div>
  );
}
