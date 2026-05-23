import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'
import LoginPage from '@/routes/LoginPage'
import AuthCallbackPage from '@/routes/AuthCallbackPage'
import HomePage from '@/routes/HomePage'
import HistoryPage from '@/routes/HistoryPage'
import SummaryDetailPage from '@/routes/SummaryDetailPage'
import SettingsPage from '@/routes/SettingsPage'
import ConnectGooglePage from '@/routes/ConnectGooglePage'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function App() {
  const { setUser, setLoading } = useUserStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/summary/:date"
          element={
            <ProtectedRoute>
              <SummaryDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connect-google"
          element={
            <ProtectedRoute>
              <ConnectGooglePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connect-google/callback"
          element={
            <ProtectedRoute>
              <ConnectGooglePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
