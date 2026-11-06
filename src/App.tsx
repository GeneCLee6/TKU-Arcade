import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast.tsx'
import { HomePage } from './pages/HomePage.tsx'

// Routes: only the home page for now; the lobby (e1) and rooms (/r/:id, A4) come later
export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
