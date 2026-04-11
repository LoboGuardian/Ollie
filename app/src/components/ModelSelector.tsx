import { ChevronDown, Cpu, AlertCircle, Cloud, Bot, Brain, Sparkles, Plus, Globe } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { useModelsStore } from '../store/modelsStore'
import { useSettingsStore } from '../store/settingsStore'

// Cloud provider model presets (updated Feb 2026)
const CLOUD_MODELS = {
  openai: [
    { id: 'gpt-5.2', name: 'GPT-5.2' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4o', name: 'GPT-4o' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4' },
  ],
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ],
  other: [], // Custom providers use manual model entry only
}

const PROVIDER_ICONS = {
  openai: Bot,
  anthropic: Brain,
  google: Sparkles,
  ollama: Cpu,
  other: Globe,
}

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customModelId, setCustomModelId] = useState('')
  const { currentModel, setCurrentModel } = useChatStore()
  const { models, isLoading, error, fetchModels } = useModelsStore()
  const { appMode, providers, activeProviderId } = useSettingsStore()

  // Get active provider info
  const activeProvider = providers.find(p => p.id === activeProviderId)
  const providerType = activeProvider?.provider_type || 'ollama'
  const isCloudMode = appMode === 'cloud' && providerType !== 'ollama'

  // Get models based on mode
  const cloudModels = isCloudMode ? (CLOUD_MODELS[providerType as keyof typeof CLOUD_MODELS] || []) : []
  const displayModels = isCloudMode
    ? cloudModels.map(m => ({ name: m.id, displayName: m.name }))
    : models.map(m => ({ name: m.name, displayName: m.name }))

  // Check if current model is custom (not in preset list)
  const isCustomModel = isCloudMode && currentModel && !cloudModels.some(m => m.id === currentModel)

  // Get provider icon
  const ProviderIcon = PROVIDER_ICONS[providerType as keyof typeof PROVIDER_ICONS] || Cloud

  useEffect(() => {
    if (!isCloudMode) {
      fetchModels()
    }
  }, [isCloudMode])

  // Auto-select first cloud model if none selected
  useEffect(() => {
    if (isCloudMode && cloudModels.length > 0 && (!currentModel || !cloudModels.some(m => m.id === currentModel)) && !isCustomModel) {
      setCurrentModel(cloudModels[0].id)
    }
  }, [isCloudMode, activeProviderId, cloudModels])

  const handleUseCustomModel = () => {
    if (customModelId.trim()) {
      setCurrentModel(customModelId.trim())
      setCustomModelId('')
      setShowCustomInput(false)
      setIsOpen(false)
    }
  }

  const selectedModel = displayModels.find(m => m.name === currentModel)
  const displayName = selectedModel?.displayName || (isCustomModel ? currentModel : 'Select a model')

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ui-surface flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all duration-150 min-w-[160px] hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <ProviderIcon size={14} className="ui-muted flex-shrink-0" />
        <span className="text-xs font-medium ui-heading truncate flex-1 text-left">
          {displayName}
        </span>
        {isCustomModel && (
          <span className="text-[9px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 rounded font-medium">Custom</span>
        )}
        <ChevronDown size={12} className="ui-muted flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="ui-dropdown absolute top-full left-0 mt-1 z-[100] max-h-80 overflow-y-auto min-w-[240px]">
          {/* Cloud Mode */}
          {isCloudMode ? (
            <div className="py-2">
              <div className="ui-muted px-4 py-1 text-xs font-medium uppercase tracking-wide">
                {activeProvider?.name || providerType} Models
              </div>
              {cloudModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => { setCurrentModel(model.id); setIsOpen(false) }}
                  className={`ui-dropdown-item w-full text-left px-4 py-2 flex items-center gap-2 ${currentModel === model.id ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <ProviderIcon size={14} className="ui-muted" />
                  <span className="text-sm ui-heading">{model.name}</span>
                </button>
              ))}

              {/* Custom Model Section */}
              <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2">
                <div className="ui-muted px-4 py-1 text-xs font-medium uppercase tracking-wide">
                  Custom Model
                </div>

                {showCustomInput ? (
                  <div className="px-4 py-2 space-y-2">
                    <input
                      type="text"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="Enter model ID (e.g., gemini-3-flash-preview)"
                      className="ui-input w-full px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-gray-900 dark:focus:border-gray-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleUseCustomModel()}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowCustomInput(false); setCustomModelId('') }}
                        className="flex-1 px-3 py-1.5 text-sm ui-muted ui-dropdown-item rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUseCustomModel}
                        disabled={!customModelId.trim()}
                        className="ui-button-primary flex-1 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50"
                      >
                        Use Model
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustomInput(true)}
                    className="ui-dropdown-item w-full text-left px-4 py-2 flex items-center gap-2 text-purple-600 dark:text-purple-300"
                  >
                    <Plus size={14} />
                    <span className="text-sm font-medium">Use Custom Model ID</span>
                  </button>
                )}

                {/* Show current custom model if active */}
                {isCustomModel && (
                  <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 flex items-center gap-2">
                    <span className="text-xs text-purple-600 dark:text-purple-300">Current:</span>
                    <span className="text-xs font-mono text-purple-800 dark:text-purple-200">{currentModel}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Local Mode */
            isLoading ? (
              <div className="ui-muted p-4 text-center">
                <div className="animate-spin w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-black dark:border-t-white rounded-full mx-auto mb-2"></div>
                Loading models...
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-600">
                <AlertCircle size={20} className="mx-auto mb-2" />
                <div className="text-sm">Failed to load models</div>
                <div className="ui-muted text-xs mt-1">{error}</div>
                <button
                  onClick={fetchModels}
                  className="mt-2 px-3 py-1 text-xs bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 rounded"
                >
                  Retry
                </button>
              </div>
            ) : displayModels.length === 0 ? (
              <div className="ui-muted p-4 text-center">
                No models found. Pull one in the Models tab.
              </div>
            ) : (
              <div className="py-2">
                <div className="ui-muted px-4 py-1 text-xs font-medium uppercase tracking-wide">
                  Local Ollama Models
                </div>
                {displayModels.map((model) => (
                  <button
                    key={model.name}
                    onClick={() => { setCurrentModel(model.name); setIsOpen(false) }}
                  className={`ui-dropdown-item w-full text-left px-4 py-2 flex items-center gap-2 ${currentModel === model.name ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                  >
                    <Cpu size={14} className="ui-muted" />
                    <span className="text-sm ui-heading truncate">{model.displayName}</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Overlay to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
