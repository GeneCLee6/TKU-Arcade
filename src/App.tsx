import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { loadRoomStrings } from './i18n/roomStrings.ts'
import { useT } from './i18n/useT.ts'
import { useUpdateReady } from './lib/installApp.ts'
import { BrowserRouter, Route, Routes } from './lib/router.tsx'
import { useLocation } from './lib/useRouter.ts'
import { HomePage } from './pages/HomePage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

// The room's chunk with the room's words in the page's language (roomStrings.ts), side by side
const roomChunk = () => {
  const strings = loadRoomStrings()
  return import('./pages/RoomPage.tsx').then((module) => strings.then(() => module))
}

// The lobby is what most people see first, so the room's code stays out of its bundle
const RoomPage = lazy(() => roomChunk().then(({ RoomPage }) => ({ default: RoomPage })))

// e2-t09: a finished game played back. Through the room's chunk, whose code it shares (the game
// screens, the layout): imported straight from here, it would split that chunk in two
const ReplayPage = lazy(() => roomChunk().then(({ ReplayEntry }) => ({ default: ReplayEntry })))

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
// 2026-11-17: with a race against the computer from its menu (src/kart/bots/KartPlay.tsx)
const KartPlayPage = lazy(() =>
  import('./kart/bots/KartPlay.tsx').then(({ KartPlay }) => ({ default: KartPlay })),
)

// e10-t07: the track editor. Its own chunk; three.js comes only with its 3D view
const KartEditorPage = lazy(() => import('./kart/editor/EditorPage.tsx'))

// 2026-11-20: a replay from a file or a link (docs/KART-NETCODE.md §11.4)
const KartReplayFilePage = lazy(() => import('./kart/watch/ReplayFilePage.tsx'))

const KartSpikePage = lazy(() =>
  import('./kart/SpikePage.tsx').then(({ SpikePage }) => ({ default: SpikePage })),
)

// 2026-11-21: a new version is out (the service worker has it): only then is its prompt loaded
const UpdatePrompt = lazy(() => import('./components/UpdatePrompt.tsx'))

function NewVersion() {
  const ready = useUpdateReady()
  return ready ? (
    <Suspense>
      <UpdatePrompt />
    </Suspense>
  ) : null
}

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
          <Route path="/kart/editor" element={<KartEditorPage />} />
          <Route path="/kart/replay" element={<KartReplayFilePage />} />
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
      <NewVersion />
    </ToastProvider>
  )
}
