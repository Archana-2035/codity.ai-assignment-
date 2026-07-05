import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuthStore } from '../store/authStore';

export default function QueuesList() {
  const { activeProject } = useAuthStore();
  const [queues, setQueues] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchQueues = () => {
    if (activeProject) {
      api.get(`/projects/${activeProject.id}/queues`).then(res => {
        setQueues(res.data.data);
      });
    }
  };

  useEffect(() => {
    fetchQueues();
  }, [activeProject]);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueueName.trim() || !activeProject) return;
    try {
      setIsSubmitting(true);
      await api.post(`/projects/${activeProject.id}/queues`, {
        name: newQueueName.trim(),
        description: 'Created from dashboard'
      });
      setNewQueueName('');
      setShowModal(false);
      fetchQueues();
    } catch (err) {
      console.error(err);
      alert('Failed to create queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Queues</h1>
        <button className="btn" onClick={() => setShowModal(true)}>Create Queue</button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1rem' }}>Create New Queue</h2>
            <form onSubmit={handleCreateQueue}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Queue Name</label>
                <input 
                  type="text" 
                  required
                  value={newQueueName}
                  onChange={e => setNewQueueName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'transparent', color: 'var(--text-primary)' }}
                  placeholder="e.g. email-delivery"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Pending</th>
              <th>Running</th>
              <th>Failed (1h)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queues.map(q => (
              <tr key={q.id}>
                <td style={{ fontWeight: 500 }}>
                  <Link to={`/queues/${q.id}`} style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>
                    {q.name}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${q.is_paused ? 'badge-dead' : 'badge-completed'}`}>
                    {q.is_paused ? 'PAUSED' : 'ACTIVE'}
                  </span>
                </td>
                <td>{q.priority}</td>
                <td style={{ color: 'var(--status-pending)' }}>{q.stats?.pendingCount || 0}</td>
                <td style={{ color: 'var(--status-running)' }}>{q.stats?.runningCount || 0}</td>
                <td style={{ color: q.stats?.failedCount > 0 ? 'var(--status-failed)' : 'inherit' }}>
                  {q.stats?.failedCount || 0}
                </td>
                <td>
                  <Link to={`/queues/${q.id}`} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>View</Link>
                </td>
              </tr>
            ))}
            {queues.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No queues found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
