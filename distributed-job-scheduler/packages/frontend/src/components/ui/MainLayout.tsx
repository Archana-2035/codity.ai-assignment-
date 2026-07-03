import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function MainLayout() {
  const { user, activeProject, logout } = useAuthStore();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'Queues', path: '/queues' },
    { name: 'Workers', path: '/workers' },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--panel-border)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '0.5rem' }}>
            DJS Platform
          </h2>
          {activeProject && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Project: <span style={{ color: 'var(--text-primary)' }}>{activeProject.name}</span>
            </div>
          )}
        </div>
        
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'block',
                  padding: '0.75rem 1.5rem',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--accent-color)' : 'transparent'}`,
                  textDecoration: 'none',
                  fontWeight: 500
                }}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.email}
          </div>
          <button onClick={logout} className="btn btn-secondary" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
