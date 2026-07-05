import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function MainLayout() {
  const { user, activeProject, logout } = useAuthStore();
  const location = useLocation();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const navItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'Queues', path: '/queues' },
    { name: 'Job Explorer', path: '/jobs' },
    { name: 'Workers', path: '/workers' },
    { name: 'Analytics', path: '/analytics' },
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
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={{
                  padding: '1rem 1.5rem',
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
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.email}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={toggleTheme} className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem 0' }}>
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
            <button onClick={logout} className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem 0' }}>
              Logout
            </button>
          </div>
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
