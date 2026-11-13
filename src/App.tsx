import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { useT } from './i18n/useT.ts'
import { BrowserRouter, Route, Routes } from './lib/router.tsx'
import { useLocation } from './lib/useRouter.ts'
import { HomePage } from './pages/HomePage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

// The lobby is what most people see first, so the room's code stays out of its bundle
const RoomPage = lazy(() =>
  import('./pages/RoomPage.tsx').then(({ RoomPage }) => ({ default: RoomPage })),
)

// e2-t09: a finished game played back. Through the room's chunk, whose code it shares (the game
// screens, the layout): imported straight from here, it would split that chunk in two
const ReplayPage = lazy(() =>
  import('./pages/RoomPage.tsx').then(({ ReplayEntry }) => ({ default: ReplayEntry })),
)

// e12-t07: the owner's daily counts. Nothing links here
const StatsPage = lazy(() =>
  import('./pages/StatsPage.tsx').then(({ StatsPage }) => ({ default: StatsPage })),
)

const RulesPage = lazy(() =>
  import('./pages/RulesPage.tsx').then(({ RulesPage }) => ({ default: RulesPage })),
)

// e8-t01: reached only by typing the address. Nothing links here, and three.js loads with this chunk
// e8-t14: the kart's time trial, the same chunk as the spike without its tools. Not in the lobby
// until the handling is signed off (K3)
const KartPlayPage = lazy(() =>
  import('./kart/SpikePage.tsx').then(({ SpikePage }) => ({ default: () => <SpikePage play /> })),
)

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
          <Route path="/r/:id/replay" element={<ReplayPage />} />
          <Route path="/games/:id/rules" element={<RulesPage />} />
          <Route path="/kart/spike" element={<KartSpikePage />} />
          <Route path="/kart" element={<KartPlayPage />} />
          <Route path="/stats" element={<StatsPage />} />
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
