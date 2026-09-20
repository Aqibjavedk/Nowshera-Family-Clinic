import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { PatientDashboard } from './pages/patient/PatientDashboard';
import { DoctorDashboard } from './pages/doctor/DoctorDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ArchitectureModal } from './components/ArchitectureModal';

function MainLayout() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<string>(
    user ? `${user.role}-dashboard` : 'login'
  );
  const [showArchitectureModal, setShowArchitectureModal] = useState<boolean>(false);

  // Synchronize view if user logs in or changes
  React.useEffect(() => {
    if (user && (currentView === 'login' || currentView === 'register')) {
      setCurrentView(`${user.role}-dashboard`);
    } else if (!user && (currentView.endsWith('-dashboard'))) {
      setCurrentView('login');
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenArchitecture={() => setShowArchitectureModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        {currentView === 'login' && <LoginPage onNavigate={setCurrentView} />}
        {currentView === 'register' && <RegisterPage onNavigate={setCurrentView} />}

        {currentView === 'patient-dashboard' && (
          <ProtectedRoute allowedRoles={['patient']} onNavigate={setCurrentView}>
            <PatientDashboard onNavigate={setCurrentView} />
          </ProtectedRoute>
        )}

        {currentView === 'doctor-dashboard' && (
          <ProtectedRoute allowedRoles={['doctor']} onNavigate={setCurrentView}>
            <DoctorDashboard onNavigate={setCurrentView} />
          </ProtectedRoute>
        )}

        {currentView === 'admin-dashboard' && (
          <ProtectedRoute allowedRoles={['admin']} onNavigate={setCurrentView}>
            <AdminDashboard onNavigate={setCurrentView} />
          </ProtectedRoute>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Nowshera Family Clinic • Doctor & Admin Management Portal</span>
          <span className="text-slate-400">React • FastAPI • Supabase PostgreSQL • Asia/Karachi (PKT)</span>
        </div>
      </footer>

      {/* Architecture Plan Modal */}
      {showArchitectureModal && (
        <ArchitectureModal onClose={() => setShowArchitectureModal(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
