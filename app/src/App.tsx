import './App.css'
import Sidebar from './components/Sidebar.tsx'
import MainPanel from './components/MainPanel.tsx'
import TopBar from './components/TopBar.tsx'
import { ModeSelectionWizard } from './components/ModeSelectionWizard.tsx'
import { NotificationContainer } from './components/Notifications.tsx'
import ModelsRoute from './routes/models'
import SettingsRoute from './routes/settings'
import MonitoringDashboard from './components/MonitoringDashboard.tsx'
import { useUIStore } from './store/uiStore'
import { useMonitoringStore } from './store/monitoringStore'
import { useSettingsStore } from './store/settingsStore'
import { useEffect } from 'react'
import TitleBar from './components/TitleBar.tsx'

function App() {
  const { view } = useUIStore()
  const { monitoringEnabled, isMonitoring, startMonitoring } = useMonitoringStore()
  const { theme, loadSettingsFromBackend } = useSettingsStore()

  // Load settings on mount
  useEffect(() => {
    loadSettingsFromBackend()
  }, [loadSettingsFromBackend])

  // System monitoring auto-resume
  useEffect(() => {
    if (monitoringEnabled && !isMonitoring) {
      startMonitoring()
    }
  }, [monitoringEnabled, isMonitoring, startMonitoring])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches)
      document.documentElement.classList.toggle('dark', isDark)
    }

    applyTheme()
    mediaQuery.addEventListener('change', applyTheme)

    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-hidden pt-8">
      <TitleBar />
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        {view === 'chat' && <MainPanel />}
        {view === 'models' && <div className="flex-1 overflow-auto bg-white dark:bg-gray-900"><ModelsRoute /></div>}
        {view === 'settings' && <div className="flex-1 overflow-auto bg-white dark:bg-gray-900"><SettingsRoute /></div>}
        {view === 'monitoring' && <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950"><MonitoringDashboard /></div>}
      </div>

      {/* Mode Selection Wizard */}
      <ModeSelectionWizard />

      {/* Notifications */}
      <NotificationContainer />
    </div>
  )
}

export default App
