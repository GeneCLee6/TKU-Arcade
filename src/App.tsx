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

const RulesPage = lazy(() =>
  import('./pages/RulesPage.tsx').then(({ RulesPage }) => ({ default: RulesPage })),
)

// e8-t01: reached only by typing the address. Nothing links here, and three.js loads with this chunk
const KartSpikePage = lazy(() =>
  import('./kart/SpikePage.tsx').then(({ SpikePage }) => ({ default: SpikePage })),
)

function RouteLoading() {
  const t = useT()
  return <p role="status">{t('common.loading')}</p>
}

// Routes: the lobby, a room, a game's rules and anything else. The boundary also catches a lazy page that cannot load
function AppRoutes() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/r/:id" element={<RoomPage />} />
          <Route path="/games/:id/rules" element={<RulesPage />} />
          <Route path="/kart/spike" element={<KartSpikePage />} />
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
