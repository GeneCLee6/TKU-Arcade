import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { useT } from './i18n/useT.ts'
import { HomePage } from './pages/HomePage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

// The lobby is what most people see first, so the room's code stays out of its bundle
const RoomPage = lazy(() =>
  import('./pages/RoomPage.tsx').then(({ RoomPage }) => ({ default: RoomPage })),
)

function RouteLoading() {
  const t = useT()
  return <p role="status">{t('common.loading')}</p>
}

// Routes: the lobby, a room and anything else. The boundary also catches a lazy page that cannot load
function AppRoutes() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/r/:id" element={<RoomPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}
