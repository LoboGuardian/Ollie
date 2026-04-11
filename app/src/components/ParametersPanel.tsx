import { useState, useEffect } from 'react'
import { Sliders } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../store/settingsStore'
import { useChatStore } from '../store/chatStore'

interface ParametersPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function ParametersPanel({ isOpen, onClose }: ParametersPanelProps) {
  const {
    defaultParams,
    setDefaultParams,
    saveSettingsToBackend
  } = useSettingsStore()

  const { currentChatId, currentSystemPrompt, setCurrentSystemPrompt } = useChatStore()

  const [localParams, setLocalParams] = useState(defaultParams)
  const [localSystemPrompt, setLocalSystemPrompt] = useState(currentSystemPrompt ?? '')
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local prompt when the active chat changes or panel opens.
  // currentSystemPrompt intentionally excluded: reset only on chat/panel change,
  // not on every external store update while the user is editing.
  useEffect(() => {
    setLocalSystemPrompt(currentSystemPrompt ?? '')
    setHasChanges(false)
  }, [currentChatId, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleParamChange = (param: string, value: number) => {
    const newParams = { ...localParams, [param]: value }
    setLocalParams(newParams)
    setHasChanges(true)
  }

  const handleSystemPromptChange = (value: string) => {
    setLocalSystemPrompt(value)
    setHasChanges(true)
  }

  const handleSave = async () => {
    setDefaultParams(localParams)
    await saveSettingsToBackend()

    // Persist per-chat system prompt to DB and update in-memory state
    if (currentChatId) {
      const promptValue = localSystemPrompt.trim() || null
      try {
        await invoke('db_set_chat_system_prompt', { chatId: currentChatId, systemPrompt: promptValue })
      } catch (e) {
        console.warn('db_set_chat_system_prompt failed', e)
      }
      setCurrentSystemPrompt(promptValue)
    }

    setHasChanges(false)
  }

  const handleReset = () => {
    setLocalParams(defaultParams)
    setLocalSystemPrompt(currentSystemPrompt ?? '')
    setHasChanges(false)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Transparent backdrop for click-outside */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* Floating Panel */}
      <div className="absolute top-full left-0 mt-2 w-80 ui-surface shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 origin-top-left">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900">
          <div className="flex items-center gap-2.5">
            <Sliders size={16} className="text-gray-900 dark:text-gray-100" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Parameters</h2>
          </div>
          <button
            onClick={handleReset}
            className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
            title="Reset to defaults"
            disabled={!hasChanges}
          >
            Reset
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* System Prompt */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">
              System Prompt
            </label>
            <textarea
              value={localSystemPrompt}
              onChange={(e) => handleSystemPromptChange(e.target.value)}
              placeholder="e.g. You are a helpful assistant..."
              className="ui-input w-full h-20 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/10 focus:border-gray-300 dark:focus:border-gray-600 text-xs resize-none"
            />
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Temperature</label>
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                {localParams.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={localParams.temperature}
              onChange={(e) => handleParamChange('temperature', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-900 dark:accent-gray-100"
            />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Top K */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Top K</label>
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                {localParams.topK}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={localParams.topK}
              onChange={(e) => handleParamChange('topK', parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-900 dark:accent-gray-100"
            />
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Top P</label>
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                {localParams.topP.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={localParams.topP}
              onChange={(e) => handleParamChange('topP', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-900 dark:accent-gray-100"
            />
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Max Tokens</label>
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                {localParams.maxTokens}
              </span>
            </div>
            <input
              type="range"
              min="256"
              max="8192"
              step="256"
              value={localParams.maxTokens}
              onChange={(e) => handleParamChange('maxTokens', parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-900 dark:accent-gray-100"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${hasChanges
              ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
          >
            Save
          </button>
        </div>
      </div>
    </>
  )
}
