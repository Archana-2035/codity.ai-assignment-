import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../store/authStore';
import toast from 'react-hot-toast';

export default function DlqList() {
  const { queueId } = useParams();
  const [entries, setEntries] = useState<any[]>([]);

  const fetchDlq = async () => {
    try {
      const res = await api.get(`/queues/${queueId}/dlq`);
      setEntries(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDlq();
  }, [queueId]);

  const handleBulkRetry = async () => {
    try {
      const res = await api.post(`/queues/${queueId}/dlq/retry-all`);
      toast.success(res.data.message);
      fetchDlq();
    } catch (err: any) {
      toast.error('Failed to retry jobs');
    }
  };

  const handleRetrySingle = async (dlqId: string) => {
    try {
      await api.post(`/dlq/${dlqId}/retry`);
      toast.success('Job requeued successfully');
      fetchDlq();
    } catch (err: any) {
      toast.error('Failed to retry job');
    }
  };

  return (
    <div>
      <Link to={`/queues/${queueId}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>&larr; Back to Queue</Link>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Dead Letter Queue</h1>
        <button onClick={handleBulkRetry} className="btn" style={{ background: 'var(--status-pending)', color: '#000' }}>
          Retry All Safe
        </button>
      </div>

      <div className="glass-panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Type</th>
              <th>Failed At</th>
              <th>Attempts</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{e.job_id.split('-')[0]}...</td>
                <td>{e.type}</td>
                <td>{new Date(e.last_failed_at).toLocaleString()}</td>
                <td>{e.failure_count}</td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--status-failed)' }}>
                  {e.failure_reason}
                </td>
                <td>
                  {!e.retried_at && (
                    <button onClick={() => handleRetrySingle(e.id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                      Requeue
                    </button>
                  )}
                  {e.retried_at && (
                    <span style={{ color: 'var(--status-completed)', fontSize: '0.875rem' }}>Retried</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No DLQ entries found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
