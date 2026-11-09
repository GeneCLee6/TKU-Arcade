import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { startAccount } from './lib/account.ts'
import { installErrorReporting } from './lib/errorReport.ts'
import { GlobalStyle } from './styles/GlobalStyle.ts'
import { initTheme } from './styles/theme.ts'

initTheme()
installErrorReporting()
// First thing: a token the bridge table sent back leaves the address before anything reads it
void startAccount()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStyle />
    <App />
  </StrictMode>,
)
