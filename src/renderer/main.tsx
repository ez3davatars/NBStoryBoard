/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { AppProvider } from './context/AppContext.tsx'

let launchReadyNotificationSent = false

const LaunchReadySignal = () => {
  useEffect(() => {
    const notifyReady = () => {
      if (launchReadyNotificationSent) return
      launchReadyNotificationSent = true
      window.electronAPI?.notifyRendererReady?.()
    }

    const timeoutId = window.setTimeout(notifyReady, 250)

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  return null
}

createRoot(document.getElementById('root')!).render(
 <StrictMode>
  <AppProvider>
   <App />
   <LaunchReadySignal />
  </AppProvider>
 </StrictMode>,
)



