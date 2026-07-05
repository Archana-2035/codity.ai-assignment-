import { useState } from 'react';
import { api, useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { getErrorMsg } from '../utils/errorHelper';

export default function Login() {
  const [email, setEmail] = useState('admin@djs.dev');
  const [password, setPassword] = useState('Admin@1234');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(state => state.login);

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
      {/* Background Elements */}
      <div className="bg-layer"></div>

      {/* Login Card */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '3.5rem 3rem', zIndex: 10, borderRadius: '24px' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', marginBottom: '3rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 100%)',
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(31,38,135,0.3)'
          }}>
            {/* SVG stacked diamonds for Codity logo */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#ff57b9" />
              <path d="M2 12L12 17L22 12" stroke="#ff57b9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="#ff57b9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem 0', letterSpacing: '-0.025em', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>Codity</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', fontWeight: 500 }}>
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
