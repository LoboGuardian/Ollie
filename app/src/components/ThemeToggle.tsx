import { Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'

export default function ThemeToggle() {
  const { theme, setTheme, saveSettingsToBackend } = useSettingsStore()

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)

    try {
      await saveSettingsToBackend()
    } catch (error) {
      console.error('Failed to save theme setting', error)
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
