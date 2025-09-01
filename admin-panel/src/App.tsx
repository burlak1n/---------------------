import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Slots from './pages/Slots';
import ExternalUsers from './pages/ExternalUsers';
import Surveys from './pages/Surveys';
import Bookings from './pages/Bookings';
import Broadcast from './pages/Broadcast';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="slots" element={<Slots />} />
          <Route path="external-users" element={<ExternalUsers />} />
          <Route path="surveys" element={<Surveys />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="broadcast" element={<Broadcast />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
