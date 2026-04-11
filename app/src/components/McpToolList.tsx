import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Wrench, RefreshCw, AlertCircle } from 'lucide-react'

interface ToolInfo {
    server: string
    name: string
    description?: string
    schema: any
}

export default function McpToolList() {
    const [tools, setTools] = useState<ToolInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchTools = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await invoke<ToolInfo[]>('list_tools')
            setTools(res)
        } catch (e: any) {
            console.error('Failed to list tools', e)
            setError(e.toString())
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTools()
        // Refresh when servers change (listen to event? or just poll/manual refresh)
        // For now manual refresh is fine or triggering from parent
    }, [])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="ui-heading text-sm font-semibold flex items-center gap-2">
                    <Wrench size={16} className="text-blue-500" />
                    Available Tools
                </h3>
                <button
                    onClick={fetchTools}
                    disabled={loading}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                    title="Refresh Tools"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs rounded-lg flex items-center gap-2">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            {!loading && tools.length === 0 && (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs italic">
                    No tools available. Connect an MCP server to see tools here.
                </div>
            )}

            <div className="grid grid-cols-1 gap-2">
                {tools.map((t, i) => (
                    <div key={`${t.server}-${t.name}-${i}`} className="ui-surface rounded-lg p-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium ui-heading">{t.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                                    {t.server}
                                </span>
                            </div>
                        </div>
                        {t.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{t.description}</p>
                        )}
                        <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                            {/* Minimal schema hint */}
                            ARGS: {Object.keys(t.schema?.properties || {}).join(', ')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
