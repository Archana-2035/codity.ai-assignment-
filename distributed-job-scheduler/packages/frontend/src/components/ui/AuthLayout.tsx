import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'var(--bg-color)'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px' }}>
        <Outlet />
      </div>
    </div>
  );
}
