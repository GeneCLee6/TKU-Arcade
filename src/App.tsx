import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast.tsx'
import { useT } from './i18n/useT.ts'
import { HomePage } from './pages/HomePage.tsx'

// The lobby is what most people see first, so the room's code stays out of its bundle
const RoomPage = lazy(() =>
  import('./pages/RoomPage.tsx').then(({ RoomPage }) => ({ default: RoomPage })),
)

function RouteLoading() {
  const t = useT()
  return <p role="status">{t('common.loading')}</p>
}

// Routes: the lobby and a room
export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/r/:id" element={<RoomPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  )
}
