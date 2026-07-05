import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';

// Layouts
import MainLayout from './components/ui/MainLayout';
import AuthLayout from './components/ui/AuthLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import QueuesList from './pages/QueuesList';
import QueueDetail from './pages/QueueDetail';
import JobDetail from './pages/JobDetail';
import JobExplorer from './pages/JobExplorer';
import WorkersList from './pages/WorkersList';
import DlqList from './pages/DlqList';
import Analytics from './pages/Analytics';

function App() {
  const { init, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  if (isLoading) {
    return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/queues" element={<QueuesList />} />
        <Route path="/queues/:queueId" element={<QueueDetail />} />
        <Route path="/queues/:queueId/dlq" element={<DlqList />} />
        <Route path="/jobs" element={<JobExplorer />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/workers" element={<WorkersList />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
