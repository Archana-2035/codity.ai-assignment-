import { create } from 'zustand';
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        
        const res = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data.data;
        
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefresh);
        
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (err) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

interface AuthState {
  user: any | null;
  activeProject: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  init: () => Promise<void>;
  login: (data: any) => void;
  logout: () => void;
  setActiveProject: (project: any) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeProject: null,
  isAuthenticated: false,
  isLoading: true,
  
  init: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('No token');
      
      const res = await api.get('/auth/me');
      const user = res.data.data;
      
      const orgId = user.organizations[0]?.id;
      if (orgId) {
        const projRes = await api.get(`/orgs/${orgId}/projects`);
        const projects = projRes.data.data;
        if (projects.length > 0) {
          set({ activeProject: projects[0] });
        }
      }
      
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false, isLoading: false, activeProject: null });
    }
  },
  
  login: (data) => {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    // Reload to finish init (fetching projects)
    window.location.href = '/';
  },
  
  logout: () => {
    api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') }).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, activeProject: null });
  },

  setActiveProject: (project) => set({ activeProject: project }),
}));

