import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { FolderSyncProvider } from './contexts/FolderSyncContext'
import SetupPage from './pages/SetupPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/layout/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"/></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FolderSyncProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="project/:id" element={<ProjectPage />} />
              <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-left"
          toastOptions={{
            duration: 4000,
            style: { fontFamily: 'Cairo, sans-serif', fontSize: '14px' },
          }}
        />
        </FolderSyncProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
