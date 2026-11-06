import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { GlobalStyle } from './styles/GlobalStyle.ts'
import { initTheme } from './styles/theme.ts'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStyle />
    <App />
  </StrictMode>,
)
