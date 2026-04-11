import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import McpServerManager from '../components/McpServerManager'
import ProviderSettings from '../components/ProviderSettings'
import { Zap, Cloud, Save, Check, ChevronDown, Book, X, Play, Cpu, Settings, Package, Wrench } from 'lucide-react'

export default function SettingsRoute() {
  const {
    serverUrl, serverPort, defaultModel, defaultParams, appMode,
    setServerUrl, setServerPort, setDefaultModel, setDefaultParams, setAppMode,
    loadSettingsFromBackend, saveSettingsToBackend
  } = useSettingsStore()

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadSettingsFromBackend() }, [])

  const save = async () => {
    setSaving(true)
    try {
      await saveSettingsToBackend()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleModeChange = (mode: 'local' | 'cloud') => {
    console.log('Handling mode change to:', mode)
    setAppMode(mode)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="ui-heading text-3xl font-bold mb-2">Settings</h1>
          <p className="ui-muted">Configure your preferences and connection settings</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 ${saved
            ? 'bg-green-600 text-white'
            : 'bg-gradient-to-br from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white'
            }`}
        >
          {saved ? (
            <><Check size={18} /> Saved</>
          ) : saving ? (
            <><Save size={18} className="animate-pulse" /> Saving...</>
          ) : (
            <><Save size={18} /> Save Settings</>
          )}
        </button>
      </div>

      <div className="space-y-8">
        {/* Mode Toggle */}
        <div className="ui-card">
          <h2 className="ui-heading text-lg font-semibold mb-4 flex items-center gap-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            Mode
          </h2>
          <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-max">
            <button
              onClick={() => handleModeChange('local')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${appMode === 'local'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
            >
              <Zap size={16} className={appMode === 'local' ? 'text-blue-600' : ''} />
              Local (Ollama)
            </button>
            <button
              onClick={() => handleModeChange('cloud')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${appMode === 'cloud'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
            >
              <Cloud size={16} className={appMode === 'cloud' ? 'text-purple-600' : ''} />
              Cloud Providers
            </button>
          </div>
          <p className="ui-muted text-xs mt-3">
            {appMode === 'local'
              ? 'Using local Ollama models. Free and private.'
              : 'Using cloud AI providers with your API keys.'
            }
          </p>
        </div>

        {/* LOCAL MODE SECTIONS */}
        {appMode === 'local' && (
          <>
            {/* Server Configuration */}
            <div className="ui-card">
              <h2 className="ui-heading text-lg font-semibold mb-4 flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Server Configuration
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="ui-label mb-2">Server Connection</label>
                  <div className="flex gap-3">
                    <input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://localhost"
                      className="ui-input flex-1 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
                    />
                    <input
                      type="number"
                      value={serverPort}
                      onChange={(e) => setServerPort(Number(e.target.value))}
                      placeholder="11434"
                      className="ui-input w-32 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <p className="ui-muted text-xs mt-2">Configure the Ollama server URL and port</p>

                  {/* Docker Help Section */}
                  <DockerHelpSection />
                </div>
              </div>
            </div>

            {/* Model Configuration */}
            <div className="ui-card">
              <h2 className="ui-heading text-lg font-semibold mb-4 flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Model Settings
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="ui-label mb-2">Default Model</label>
                  <input
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    placeholder="llama3:instruct"
                    className="ui-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
                  />
                  <p className="ui-muted text-xs mt-2">Model to use by default for new chats</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* CLOUD MODE SECTIONS */}
        {appMode === 'cloud' && (
          <div className="ui-card">
            <h2 className="ui-heading text-lg font-semibold mb-4 flex items-center gap-3">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              LLM Providers
            </h2>
            <ProviderSettings />
          </div>
        )}

        {/* ALWAYS VISIBLE SECTIONS */}
        {/* Generation Parameters */}
        <div className="ui-card">
          <h2 className="ui-heading text-lg font-semibold mb-4 flex items-center gap-3">
            <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
            Generation Parameters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="ui-label mb-2">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={defaultParams.temperature}
                onChange={(e) => setDefaultParams({ temperature: Number(e.target.value) })}
                className="ui-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
              />
              <p className="ui-muted text-xs mt-1">Controls randomness (0.0 - 2.0)</p>
            </div>
            <div>
              <label className="ui-label mb-2">Top K</label>
              <input
                type="number"
                min="1"
                value={defaultParams.topK}
                onChange={(e) => setDefaultParams({ topK: Number(e.target.value) })}
                className="ui-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
              />
              <p className="ui-muted text-xs mt-1">Limits token choices</p>
            </div>
            <div>
              <label className="ui-label mb-2">Top P</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={defaultParams.topP}
                onChange={(e) => setDefaultParams({ topP: Number(e.target.value) })}
                className="ui-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
              />
              <p className="ui-muted text-xs mt-1">Nucleus sampling (0.0 - 1.0)</p>
            </div>
            <div>
              <label className="ui-label mb-2">Max Tokens</label>
              <input
                type="number"
                min="1"
                value={defaultParams.maxTokens}
                onChange={(e) => setDefaultParams({ maxTokens: Number(e.target.value) })}
                className="ui-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
              />
              <p className="ui-muted text-xs mt-1">Maximum response length</p>
            </div>
          </div>
        </div>

        {/* MCP Servers */}
        <div className="ui-card">
          <McpServerManager />
        </div>
      </div>
    </div>
  )
}

// Docker Help Section Component
function DockerHelpSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
        Using Docker or a remote server?
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm space-y-3">
          <p className="text-gray-700">
            If you're running Ollama in Docker or on another machine, configure the URL to point to that server:
          </p>

          <div className="space-y-2">
            <div className="font-medium text-gray-800">Common configurations:</div>
            <div className="bg-white rounded-lg p-3 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Docker (same machine):</span>
                <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">http://host.docker.internal:11434</code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Remote server:</span>
                <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">http://192.168.1.100:11434</code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Custom port:</span>
                <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">http://localhost:8080</code>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-blue-200">
            <p className="text-xs text-gray-600 mb-2">
              <strong>Docker users:</strong> Make sure your Ollama container exposes port 11434:
            </p>
            <code className="block bg-gray-800 text-green-400 px-3 py-2 rounded-lg text-xs overflow-x-auto">
              docker run -d -p 11434:11434 ollama/ollama
            </code>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
          >
            <Book size={12} />
            Learn more about Ollama Docker setup
          </button>
        </div>
      )}

      {/* Docker Help Modal */}
      {showModal && <DockerHelpModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

// Docker Help Modal Component
function DockerHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <Book className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Ollama Docker Setup Guide</h2>
              <p className="text-sm text-gray-600">Running Ollama in Docker or on a remote server</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)] space-y-6">
          {/* Quick Start */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><Play size={18} className="text-blue-500" /> Quick Start with Docker</h3>
            <p className="text-gray-600 mb-3">
              Run Ollama in Docker with a single command:
            </p>
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm">
              <code className="text-green-400">docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama</code>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This creates a persistent volume for your models and exposes port 11434.
            </p>
          </section>

          {/* GPU Support */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><Cpu size={18} className="text-green-500" /> GPU Support (NVIDIA)</h3>
            <p className="text-gray-600 mb-3">
              For GPU acceleration, use the NVIDIA Container Toolkit:
            </p>
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm space-y-2">
              <div className="text-gray-400"># Install NVIDIA Container Toolkit first, then:</div>
              <code className="text-green-400 block">docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama</code>
            </div>
          </section>

          {/* Configuring Ollie */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><Settings size={18} className="text-purple-500" /> Configuring Ollie</h3>
            <p className="text-gray-600 mb-3">
              Update the server URL in Ollie settings based on your setup:
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">1</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Same machine (Docker Desktop)</div>
                  <code className="text-sm text-gray-600">http://localhost:11434</code>
                  <p className="text-xs text-gray-500 mt-1">Use when running Docker on the same computer as Ollie</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">2</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Remote server / NAS</div>
                  <code className="text-sm text-gray-600">http://192.168.1.100:11434</code>
                  <p className="text-xs text-gray-500 mt-1">Replace with your server's IP address</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">3</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Docker from inside another container</div>
                  <code className="text-sm text-gray-600">http://host.docker.internal:11434</code>
                  <p className="text-xs text-gray-500 mt-1">Special hostname to reach host from container</p>
                </div>
              </div>
            </div>
          </section>

          {/* Running Models */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><Package size={18} className="text-orange-500" /> Pulling Models</h3>
            <p className="text-gray-600 mb-3">
              Pull models into your Docker container:
            </p>
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm space-y-2">
              <code className="text-green-400 block">docker exec -it ollama ollama pull llama3.1</code>
              <code className="text-green-400 block">docker exec -it ollama ollama pull codellama</code>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Or use Ollie's Models panel to pull models directly!
            </p>
          </section>

          {/* Troubleshooting */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><Wrench size={18} className="text-amber-500" /> Troubleshooting</h3>
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="font-medium text-amber-800">Connection refused?</div>
                <p className="text-sm text-amber-700 mt-1">
                  Make sure the container is running: <code className="bg-amber-100 px-1 rounded">docker ps</code>
                </p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="font-medium text-amber-800">Port already in use?</div>
                <p className="text-sm text-amber-700 mt-1">
                  Use a different port: <code className="bg-amber-100 px-1 rounded">-p 8080:11434</code> then set URL to <code className="bg-amber-100 px-1 rounded">http://localhost:8080</code>
                </p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="font-medium text-amber-800">Models not persisting?</div>
                <p className="text-sm text-amber-700 mt-1">
                  Always use a volume: <code className="bg-amber-100 px-1 rounded">-v ollama:/root/.ollama</code>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
