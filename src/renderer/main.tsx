/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {
  clearVolatileStagingStorage,
  clearVolatileWorkspaceDataStores,
  dumpBrowserStorage
} from './utils/resetVolatileWorkspaceState'

let launchReadyNotificationSent = false
const RESET_AUDIT_BUILD = 'staging-reset-audit-001'

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

const bootstrap = async () => {
  console.warn('[CDS STARTUP RESET BUILD] staging-reset-audit-001')
  window.__CDS_RESET_AUDIT_BUILD__ = RESET_AUDIT_BUILD

  dumpBrowserStorage('before clear')
  clearVolatileStagingStorage()
  await clearVolatileWorkspaceDataStores()
  dumpBrowserStorage('after clear')

  const [{ default: App }, { AppProvider }] = await Promise.all([
    import('./App.tsx'),
    import('./context/AppContext.tsx'),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider>
        <App />
        <LaunchReadySignal />
      </AppProvider>
    </StrictMode>,
  )
}

void bootstrap()



