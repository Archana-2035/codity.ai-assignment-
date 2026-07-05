import { useEffect, useState } from 'react';
import { api } from '../store/authStore';
import toast from 'react-hot-toast';
import { getErrorMsg } from '../utils/errorHelper';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);

  const fetchStats = async () => {
    try {
      const res = await api.get('/stats');
      setStats(res.data.data);
    } catch (err) {
      toast.error(getErrorMsg(err, 'Failed to load stats'));
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div>Loading...</div>;

  const activeJobs = (stats.jobs.running || 0) + (stats.jobs.claimed || 0);

  return (
    <div>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>System Dashboard</h1>
      
      <div className="grid-cards">
        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Active Workers</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-running)' }}>
            {stats.workers.active || 0}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{stats.workers.idle || 0} idle</span>
          </div>
        </div>

        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>In-Flight Jobs</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-pending)' }}>
            {activeJobs}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{stats.jobs.pending || 0} queued</span>
          </div>
        </div>

        <div className="glass-panel">
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Throughput (5m)</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--status-completed)' }}>
            {stats.throughputLast5Min}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            Jobs completed
          </div>
        </div>
      </div>
      
    </div>
  );
}
