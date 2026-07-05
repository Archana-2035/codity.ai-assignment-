import { useState } from 'react';
import { api, useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { getErrorMsg } from '../utils/errorHelper';
import { useThemeStore } from '../store/themeStore';

export default function Login() {
  const [email, setEmail] = useState('admin@djs.dev');
  const [password, setPassword] = useState('Admin@1234');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(state => state.login);
  const { theme, toggleTheme } = useThemeStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.data);
      toast.success('Login successful');
    } catch (err: any) {
      toast.error(getErrorMsg(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      
      {/* Theme Toggle Top Right */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 50 }}>
        <button onClick={toggleTheme} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', borderRadius: '12px' }}>
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Background Elements */}

      {/* Login Card */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '3.5rem 3rem', zIndex: 10, borderRadius: '24px' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', marginBottom: '3rem' }}>
          <div style={{
            background: 'var(--panel-bg)',
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            {/* SVG stacked diamonds for Codity logo */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--accent-color)" />
              <path d="M2 12L12 17L22 12" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem 0', letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>Codity</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 500 }}>
              Sign in to manage your distributed workloads
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="premium-input"
              placeholder="Email address"
              required
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="premium-input"
              placeholder="Password"
              required
            />
          </div>
          <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}>
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
