import { Settings, Database, Plus, Search, Trash2, Activity, Bot, MessageSquare, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../store/chatStore'
import Dialog from './Dialog'

type ChatMeta = {
  id: string
  created_at: number
  updated_at: number
  model?: string | null
  system_prompt?: string | null
  title?: string | null
  has_messages?: boolean
}

export default function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedChatQuery, setCollapsedChatQuery] = useState('')
  const [collapsedChatPickerOpen, setCollapsedChatPickerOpen] = useState(false)
  const [chats, setChats] = useState<ChatMeta[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const collapsedPickerRef = useRef<HTMLDivElement>(null)
  const { loadChat, createNewChat, currentChatId } = useChatStore()
  const { view: currentView, setView, sidebarCollapsed, setSidebarCollapsed } = useUIStore()

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

  const refreshChats = async () => {
    try {
      const rows = await invoke<any>('db_list_chats_with_flags', { limit: 200 })
      setChats(rows as ChatMeta[])
      const list = rows as ChatMeta[]
      const entries: Record<string, string> = {}
      for (const c of list) {
        try {
          if (!c.has_messages) continue
          const msgs = await invoke<any[]>('db_list_messages', { chatId: c.id, limit: 1 })
          if (Array.isArray(msgs) && msgs.length > 0) {
            const m = msgs[0] as any
            const raw = String(m.content || '')
            const oneLine = raw.replace(/\s+/g, ' ').trim()
            const trimmed = oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine
            entries[c.id] = trimmed
          }
        } catch { }
      }
      setPreviews(entries)
    } catch (e) {
      console.warn('db_list_chats failed', e)
      setChats([])
    }
  }

  useEffect(() => {
    refreshChats()
    const onRefresh = () => refreshChats()
    window.addEventListener('chats-refresh', onRefresh as EventListener)
    return () => window.removeEventListener('chats-refresh', onRefresh as EventListener)
  }, [])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(c => (c.model || '').toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
  }, [searchQuery, chats])

  const collapsedFiltered = useMemo(() => {
    const q = collapsedChatQuery.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.model || '').toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    )
  }, [collapsedChatQuery, chats])

  useEffect(() => {
    if (!collapsedChatPickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!collapsedPickerRef.current?.contains(event.target as Node)) {
        setCollapsedChatPickerOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [collapsedChatPickerOpen])

  const handleSelectChat = async (chat: ChatMeta) => {
    if (chat.model) {
      useChatStore.getState().setCurrentModel(chat.model)
    }
    await loadChat(chat.id, chat.system_prompt, chat.title)
    setView('chat')
    setCollapsedChatPickerOpen(false)
  }

  const handleCreateChat = async () => {
    const { messages } = useChatStore.getState()
    if (currentChatId && messages.length === 0) {
      setAlertMsg('Finish or start a conversation in the current chat before creating a new one.')
      return
    }

    if (!currentChatId && chats.length > 0) {
      try {
        const latest = chats[0]
        const rows = await invoke<any>('db_list_messages', { chatId: latest.id, limit: 1 })
        if (Array.isArray(rows) && rows.length === 0) {
          setAlertMsg('Your most recent chat is empty. Send a message first before creating a new chat.')
          return
        }
      } catch { }
    }

    const id = await createNewChat()
    if (id) {
      await refreshChats()
      setView('chat')
    }
  }

  return (
    <>
      {sidebarCollapsed ? (
        <div className="relative z-20 w-20 bg-gray-50/50 dark:bg-gray-900 border-r border-gray-200/80 dark:border-gray-800 flex flex-col items-center py-4 gap-4 overflow-visible">
          <button
            onClick={() => {
              setSidebarCollapsed(false)
              setView('chat')
            }}
            className="w-11 h-11 flex items-center justify-center rounded-2xl ui-surface hover:border-gray-300 dark:hover:border-gray-600 transition-all"
            title="Open sidebar"
          >
            <img src="/ollie-logo.png" alt="Ollie" className="w-7 h-7 object-contain" />
          </button>

          <button
            onClick={() => setSidebarCollapsed(false)}
            className="ui-icon-button"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>

          <button
            onClick={handleCreateChat}
            className="ui-icon-button"
            title="New chat"
          >
            <Plus size={18} />
          </button>

          <div className="w-10 h-px bg-gray-200 dark:bg-gray-800" />

          <div className="flex flex-col items-center gap-2">
            <div ref={collapsedPickerRef} className="relative">
              <SidebarIconButton
                icon={<MessageSquare size={18} />}
                label="Chat"
                isActive={currentView === 'chat' || collapsedChatPickerOpen}
                onClick={() => {
                  setView('chat')
                  setCollapsedChatPickerOpen((open) => !open)
                }}
              />

              {collapsedChatPickerOpen && (
                <div className="absolute left-14 top-0 w-80 ui-dropdown rounded-2xl shadow-2xl overflow-hidden z-40">
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Chats
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search chats..."
                        value={collapsedChatQuery}
                        onChange={(e) => setCollapsedChatQuery(e.target.value)}
                        className="ui-input ui-input-focus w-full pl-8 pr-3 py-2 rounded-md text-xs transition-all duration-150"
                      />
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto p-2">
                    {collapsedFiltered.length === 0 ? (
                      <div className="px-3 py-8 text-center">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          No chats found
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Try a different search
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {collapsedFiltered.map((chat) => (
                          <button
                            key={chat.id}
                            onClick={() => handleSelectChat(chat)}
                            className={`w-full text-left rounded-xl px-3 py-3 border transition-all duration-150 ${currentChatId === chat.id
                              ? 'bg-gray-50 border-gray-200 shadow-sm dark:bg-gray-700 dark:border-gray-600'
                              : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/80 hover:border-gray-200 dark:hover:border-gray-600'
                              }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {chat.title || 'Untitled chat'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4 mb-1">
                              <span className="ui-chip-sm">{chat.model || 'Unknown model'}</span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(chat.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                            {previews[chat.id] && (
                              <div className="ml-4 text-xs text-gray-500 truncate">
                                {previews[chat.id]}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <SidebarIconButton
              icon={<Activity size={18} />}
              label="Monitoring"
              isActive={currentView === 'monitoring'}
              onClick={() => setView('monitoring')}
            />
            <SidebarIconButton
              icon={<Database size={18} />}
              label="Manage models"
              isActive={currentView === 'models'}
              onClick={() => setView('models')}
            />
            <SidebarIconButton
              icon={<Settings size={18} />}
              label="Settings"
              isActive={currentView === 'settings'}
              onClick={() => setView('settings')}
            />
          </div>
        </div>
      ) : (
        <div className="w-72 bg-gray-50/50 dark:bg-gray-900 border-r border-gray-200/80 dark:border-gray-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200/60 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <img src="/ollie-logo.png" alt="Ollie" className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0">
                  <h1 className="ui-heading text-base font-semibold">Ollie</h1>
                  <p className="ui-muted text-[10px]">AI Chat Interface</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="ui-icon-button p-2"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            <button
              onClick={handleCreateChat}
              className="ui-button-primary-muted w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium"
            >
              <Plus size={16} strokeWidth={2} />
              <span>New chat</span>
            </button>
          </div>

          <div className="px-4 py-3 border-b border-gray-200/60 dark:border-gray-800">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ui-input ui-input-focus w-full pl-8 pr-3 py-2 rounded-md text-xs transition-all duration-150"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
                    <Bot size={20} className="text-gray-400" />
                  </div>
                  <div className="text-sm font-medium">No conversations yet</div>
                  <div className="text-xs text-gray-400 mt-1">Start a new chat to see it here</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((c) => (
                    <div key={c.id} className="relative flex items-center gap-3 group">
                      <button
                        onClick={async () => {
                          await handleSelectChat(c)
                        }}
                        className={`flex-1 min-w-0 text-left px-4 py-3 rounded-xl border transition-all duration-200 ${currentChatId === c.id
                          ? 'bg-gray-50 border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700'
                          : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-100 hover:shadow-sm dark:bg-gray-900 dark:hover:bg-gray-800 dark:hover:border-gray-700'
                          }`}
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {c.title || 'Untitled chat'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-5 mb-1.5">
                          <span className="ui-chip-sm">
                            {c.model || 'Unknown model'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(c.updated_at).toLocaleDateString()}
                          </span>
                        </div>

                        {previews[c.id] && (
                          <div className="text-xs text-gray-500 truncate ml-5">
                            {previews[c.id]}
                          </div>
                        )}
                      </button>
                      <button
                        title={c.has_messages ? 'Delete chat' : 'Cannot delete an empty chat'}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all duration-200 ${c.has_messages
                          ? 'text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-300'
                          : 'hidden'
                          }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!c.has_messages) return
                          setDeleteId(c.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
            <div className="space-y-1">
              <MenuButton
                icon={<Activity size={18} />}
                label="Monitoring"
                isActive={currentView === 'monitoring'}
                onClick={() => setView('monitoring')}
              />
              <MenuButton
                icon={<Database size={18} />}
                label="Manage models"
                isActive={currentView === 'models'}
                onClick={() => setView('models')}
              />
              <MenuButton
                icon={<Settings size={18} />}
                label="Settings"
                isActive={currentView === 'settings'}
                onClick={() => setView('settings')}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog
        isOpen={!!alertMsg}
        title="Cannot Create Chat"
        description={alertMsg || ''}
        type="alert"
        confirmLabel="OK"
        onConfirm={() => setAlertMsg(null)}
        onCancel={() => setAlertMsg(null)}
      />

      <Dialog
        isOpen={!!deleteId}
        title="Delete Chat?"
        description="This action cannot be undone. The chat history will be permanently removed."
        type="confirm"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteId) return
          try {
            const ok = await invoke<boolean>('db_delete_chat', { chatId: deleteId })
            if (ok) {
              await refreshChats()
              if (currentChatId === deleteId) {
                useChatStore.getState().clearMessages()
                useChatStore.getState().setCurrentChatId(null)
              }
            }
          } catch (err) {
            console.error('Delete chat failed', err)
          } finally {
            setDeleteId(null)
          }
        }}
        onCancel={() => setDeleteId(null)}
      />
    </>
  )
}

function MenuButton({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium group active:scale-95 ${isActive
        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
    >
      <div className={`${isActive ? 'text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-gray-100'}`}>
        {icon}
      </div>
      <span>{label}</span>
    </button>
  )
}

function SidebarIconButton({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${isActive
        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
    >
      {icon}
    </button>
  )
}
