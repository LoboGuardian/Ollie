import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { Window } from '@tauri-apps/api/window'
import { useState, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { useUIStore } from '../store/uiStore'

export default function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false)
    const appWindow = Window.getCurrent()
    const { currentChatTitle, currentModel } = useChatStore()
    const { view, zenMode } = useUIStore()
    const isZenMode = view === 'chat' && zenMode
    const windowLabel = isZenMode
        ? [currentChatTitle || 'Untitled chat', currentModel || null].filter(Boolean).join(' · ')
        : 'Ollie'

    useEffect(() => {
        const checkMaximized = async () => {
            setIsMaximized(await appWindow.isMaximized())
        }

        // Check initially
        checkMaximized()

        // Listen to resize to update UI if native snap happens
        const unlisten = appWindow.listen('tauri://resize', checkMaximized)

        return () => {
            unlisten.then(f => f())
        }
    }, [])

    const minimize = () => appWindow.minimize()
    const toggleMaximize = async () => {
        const maximized = await appWindow.isMaximized()
        if (maximized) {
            appWindow.unmaximize()
        } else {
            appWindow.maximize()
        }
        setIsMaximized(!maximized)
    }
    const close = () => appWindow.close()

    return (
        <div data-tauri-drag-region className="h-8 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between select-none fixed top-0 left-0 right-0 z-50">
            {/* Title / Drag Area */}
            <div className="flex-1 h-full flex items-center px-4" data-tauri-drag-region>
                <span className={`pointer-events-none truncate ${isZenMode
                    ? 'text-xs font-medium text-gray-500 dark:text-gray-400 normal-case tracking-normal max-w-[70vw]'
                    : 'text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wide uppercase'
                    }`}
                >
                    {windowLabel}
                </span>
            </div>

            {/* Window Controls */}
            <div className="flex h-full">
                <button
                    onClick={minimize}
                    className="h-full w-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-150 focus:outline-none"
                    tabIndex={-1}
                >
                    <Minus size={12} strokeWidth={1.5} />
                </button>
                <button
                    onClick={toggleMaximize}
                    className="h-full w-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-150 focus:outline-none"
                    tabIndex={-1}
                >
                    {isMaximized ? <Square size={10} fill="currentColor" className="opacity-60" /> : <Maximize2 size={11} strokeWidth={1.5} />}
                </button>
                <button
                    onClick={close}
                    className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-red-500 hover:text-white transition-all duration-150 focus:outline-none"
                    tabIndex={-1}
                >
                    <X size={12} strokeWidth={1.5} />
                </button>
            </div>
        </div>
    )
}
