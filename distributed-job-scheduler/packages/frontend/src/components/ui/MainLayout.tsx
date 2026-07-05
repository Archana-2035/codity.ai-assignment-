import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function MainLayout() {
  const { user, activeProject, logout } = useAuthStore();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'Queues', path: '/queues' },
    { name: 'Job Explorer', path: '/jobs' },
    { name: 'Workers', path: '/workers' },
    { name: 'Analytics', path: '/analytics' },
  ];

  return (
    <div className="layout">
      {/* Background Elements */}
      <div className="grid-bg"></div>
      <div className="radial-glow-left"></div>
      <div className="radial-glow-right"></div>
      
      <aside className="sidebar">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'var(--accent-color)',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px var(--accent-glow)'
          }}>
            {/* SVG stacked diamonds for Codity logo */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" />
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.025em' }}>
              Codity
            </h2>
            {activeProject && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {activeProject.name}
              </div>
            )}
          </div>
        </div>
        
        <nav style={{ flex: 1, padding: '1.5rem 0' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={{
                  padding: '0.875rem 1.5rem',
                  textDecoration: 'none',
                  display: 'block'
                }}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
            Logged in as <strong style={{ color: '#fff' }}>{user?.email}</strong>
          </div>
          <button onClick={logout} className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem 0' }}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
