import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { installErrorReporting } from './lib/errorReport.ts'
import { GlobalStyle } from './styles/GlobalStyle.ts'
import { initTheme } from './styles/theme.ts'

initTheme()
installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStyle />
    <App />
  </StrictMode>,
)
