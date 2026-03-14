import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BriefPage from './pages/BriefPage';
import ApprovalPage from './pages/ApprovalPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import MainLayout from './components/MainLayout';

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<BriefPage />} />
          <Route path="/approval/:id" element={<ApprovalPage />} />
          <Route path="/dashboard/:id" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;
