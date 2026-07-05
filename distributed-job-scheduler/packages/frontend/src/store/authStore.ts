import { create } from 'zustand';
import axios from 'axios';

export const api = axios.create({
  baseURL: '', // Force relative URL to always use Vercel proxy
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (config.url && !config.url.startsWith('/api/v1')) {
    const cleanUrl = config.url.startsWith('/') ? config.url.substring(1) : config.url;
    config.url = `/api/v1/${cleanUrl}`;
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
        const baseURL = '';
        await axios.post(`${baseURL}/api/v1/auth/refresh`, {}, { withCredentials: true });
        
        return api(originalRequest);
      } catch (err) {
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
      set({ user: null, isAuthenticated: false, isLoading: false, activeProject: null });
    }
  },
  
  login: (data) => {
    set({ user: data.user, isAuthenticated: true });
    // Reload to finish init (fetching projects)
    window.location.href = '/';
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {}
    set({ user: null, isAuthenticated: false, activeProject: null });
  },

  setActiveProject: (project) => set({ activeProject: project }),
}));

