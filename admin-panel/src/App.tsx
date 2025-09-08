import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import Dashboard from './pages/Dashboard';
import Surveys from './pages/Surveys';
import Roles from './pages/Roles';
import Votes from './pages/Votes';
import './App.css';
import ExternalUsers from './pages/ExternalUsers';
import Bookings from './pages/Bookings';
import Broadcast from './pages/Broadcast';
import Slots from './pages/Slots';
import NoResponseUsers from './pages/NoResponseUsers';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/surveys" replace />} />
          <Route path="surveys" element={<Surveys />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="slots" element={<Slots />} />
          <Route path="external-users" element={<ExternalUsers />} />
          <Route path="votes" element={<Votes />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="broadcast" element={<Broadcast />} />
          <Route path="no-response-users" element={<NoResponseUsers />} />
          <Route path="roles" element={<Roles />} />
        </Route>
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
