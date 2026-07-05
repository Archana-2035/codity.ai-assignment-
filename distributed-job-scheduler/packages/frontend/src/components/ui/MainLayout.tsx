import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';

export default function MainLayout() {
  const { user, activeProject, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
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
      <div className="bg-layer"></div>
      
      {/* Floating Pill Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
          <div style={{
            background: 'var(--panel-bg)',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--accent-color)" />
              <path d="M2 12L12 17L22 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.025em' }}>
            Codity
          </h2>
        </div>
        
        <nav style={{ flex: 1, padding: '2rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '2rem 1.5rem', background: 'var(--bg-color)' }}>
          {activeProject && (
            <div style={{ marginBottom: '1.5rem', background: 'var(--panel-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Active Project</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeProject.name}</div>
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
             <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--accent-text)' }}>
                {user?.email?.[0].toUpperCase()}
             </div>
             <div style={{ flex: 1, overflow: 'hidden' }}>
               <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
             </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button onClick={toggleTheme} className="btn btn-secondary" style={{ flex: 1, padding: '0.75rem 0', borderRadius: '12px' }}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button onClick={logout} className="btn btn-secondary" style={{ flex: 1, padding: '0.75rem 0', borderRadius: '12px' }}>
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content glass-panel" style={{ padding: '2rem', border: 'none', background: 'var(--panel-bg)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
