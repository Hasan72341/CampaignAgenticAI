import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BriefPage from './pages/BriefPage';
import ApprovalPage from './pages/ApprovalPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Routes>
          <Route path="/" element={<BriefPage />} />
          <Route path="/approval/:id" element={<ApprovalPage />} />
          <Route path="/dashboard/:id" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
