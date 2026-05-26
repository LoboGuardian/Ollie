import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from './settingsStore'
import { useModelsStore } from './modelsStore'
import { persistence } from '../services/persistenceService'
import { createStreamingPipeline } from '../services/streamingPipeline'
import { resolveProvider, buildApiMessages, invokeChat } from '../services/conversationService'

export interface ToolCallState {
  id: string
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
  status: 'calling' | 'done'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: string[]
  files?: { name: string; content: string }[]
  toolCalls?: ToolCallState[]
  timestamp: number
  isStreaming?: boolean
}

export interface ChatOptions {
  temperature?: number
  topK?: number
  topP?: number
  maxTokens?: number
}

interface ChatState {
  messages: ChatMessage[]
  currentChatId: string | null
  currentChatTitle: string | null
  currentModel: string
  isLoadingChat: boolean
  isStreaming: boolean
  streamingMessageId: string | null
  currentStreamId: string | null
  currentSystemPrompt: string | null

  setCurrentModel: (model: string) => void
  setCurrentChatId: (chatId: string | null) => void
  setCurrentChatTitle: (title: string | null) => void
  setCurrentSystemPrompt: (prompt: string | null) => void
  createNewChat: (opts?: { model?: string; systemPrompt?: string; paramsJson?: string }) => Promise<string | null>
  loadChat: (chatId: string, systemPrompt?: string | null, title?: string | null) => Promise<boolean>
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, content: string) => void
  updateStreamingMessage: (id: string, content: string) => void
  updateMessageToolCalls: (id: string, toolCall: ToolCallState) => void
  markToolCallsDone: (id: string) => void
  setStreaming: (isStreaming: boolean, messageId?: string, streamId?: string) => void
  sendMessage: (content: string, options?: ChatOptions, images?: string[], files?: { name: string; content: string }[]) => Promise<void>
  editUserMessage: (messageId: string, newContent: string) => Promise<void>
  stopStreaming: () => void
  clearMessages: () => void
  generateAutoTitle: (chatId: string, userContent: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  currentChatId: null,
  currentChatTitle: null,
  currentModel: '',
  isLoadingChat: false,
  isStreaming: false,
  streamingMessageId: null,
  currentStreamId: null,
  currentSystemPrompt: null,

  setCurrentModel: (model) => set({ currentModel: model }),
  setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
  setCurrentChatTitle: (currentChatTitle) => set({ currentChatTitle }),
  setCurrentSystemPrompt: (prompt) => set({ currentSystemPrompt: prompt }),

  createNewChat: async (opts) => {
    try {
      const res = await persistence.createChat(
        (opts?.model ?? get().currentModel) || null,
        opts?.systemPrompt ?? (useSettingsStore.getState().systemPrompt || null),
        opts?.paramsJson ?? null,
      )
      set({
        currentChatId: res.id,
        currentChatTitle: res.title || null,
        messages: [],
        currentSystemPrompt: res.system_prompt || null,
        isLoadingChat: false,
      })
      return res.id
    } catch (e) {
      console.error('db_create_chat failed', e)
      return null
    }
  },

  loadChat: async (chatId, systemPrompt, title) => {
    try {
      const state = get()
      if (state.isStreaming) await state.stopStreaming()
      set({ currentChatId: chatId, currentChatTitle: title || null, messages: [], currentSystemPrompt: systemPrompt || null, isLoadingChat: true })

      const rows = await persistence.listMessages(chatId)
      const msgs: ChatMessage[] = rows.map((r) => {
        let images: string[] | undefined
        let files: { name: string; content: string }[] | undefined
        try {
          if (r.meta_json) {
            const meta = JSON.parse(r.meta_json)
            if (meta.images && Array.isArray(meta.images)) images = meta.images
            if (meta.files && Array.isArray(meta.files)) files = meta.files
          }
        } catch { /* ignore malformed meta_json */ }
        return {
          id: r.id,
          role: r.role as 'user' | 'assistant' | 'system',
          content: r.content,
          images,
          files,
          timestamp: Number(r.created_at) || Date.now(),
        }
      })
      set({ messages: msgs, isLoadingChat: false })
      return true
    } catch (e) {
      console.error('db_list_messages failed', e)
      set({ isLoadingChat: false })
      return false
    }
  },

  addMessage: (message) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    set((state) => ({ messages: [...state.messages, { ...message, id, timestamp: Date.now() }] }))
    return id
  },

  updateMessage: (id, content) => {
    set((state) => {
      const idx = state.messages.findIndex(m => m.id === id)
      if (idx === -1) return state
      const msgs = [...state.messages]
      msgs[idx] = { ...msgs[idx], content, isStreaming: false }
      return { messages: msgs }
    })
  },

  updateStreamingMessage: (id, content) => {
    set((state) => {
      const idx = state.messages.findIndex(m => m.id === id)
      if (idx === -1) return state
      const msgs = [...state.messages]
      msgs[idx] = { ...msgs[idx], content, isStreaming: true }
      return { messages: msgs }
    })
  },

  updateMessageToolCalls: (id, toolCall) => {
    set((state) => {
      const idx = state.messages.findIndex(m => m.id === id)
      if (idx === -1) return state
      const msgs = [...state.messages]
      const msg = msgs[idx]
      const current = msg.toolCalls || []
      if (current.some(t => t.id === toolCall.id)) return state
      msgs[idx] = { ...msg, toolCalls: [...current, toolCall] }
      return { messages: msgs }
    })
  },

  markToolCallsDone: (id) => {
    set((state) => {
      const idx = state.messages.findIndex(m => m.id === id)
      if (idx === -1) return state
      const msgs = [...state.messages]
      const msg = msgs[idx]
      if (!msg.toolCalls) return state
      msgs[idx] = { ...msg, toolCalls: msg.toolCalls.map(t => ({ ...t, status: 'done' as const })) }
      return { messages: msgs }
    })
  },

  setStreaming: (isStreaming, messageId, streamId) => {
    set({ isStreaming, streamingMessageId: messageId || null, currentStreamId: streamId || null })
  },

  sendMessage: async (content, options, images, files) => {
    const state = get()
    if (state.isStreaming) return
    set({ isStreaming: true })

    if (!state.currentModel) { set({ isStreaming: false }); return }

    if (!state.currentChatId) await get().createNewChat({ model: state.currentModel })

    get().addMessage({ role: 'user', content: content.trim(), images, files })
    const chatId = get().currentChatId

    if (chatId) {
      try {
        if (state.currentModel) persistence.setChatModel(chatId, state.currentModel).catch(() => {})
        const metaJson = (images?.length || files?.length)
          ? JSON.stringify({ ...(images?.length ? { images } : {}), ...(files?.length ? { files } : {}) })
          : null
        await persistence.appendMessage(chatId, 'user', content.trim(), metaJson)
        window.dispatchEvent(new CustomEvent('chats-refresh'))
      } catch (e) {
        console.warn('db_append_message (user) failed', e)
      }
    }

    const assistantMessageId = get().addMessage({ role: 'assistant', content: '', isStreaming: true })

    const pipeline = await createStreamingPipeline({
      onDisplay: (text) => get().updateStreamingMessage(assistantMessageId, text),
      onStreamStart: (streamId) => get().setStreaming(true, assistantMessageId, streamId),
      onToolCall: (tool) => get().updateMessageToolCalls(assistantMessageId, tool),
      onContentStart: () => {
        const msg = get().messages.find(m => m.id === assistantMessageId)
        if (msg?.toolCalls?.some(t => t.status === 'calling')) get().markToolCallsDone(assistantMessageId)
      },
      onCancel: () => get().setStreaming(false),
      onError: (msg) => {
        get().setStreaming(false)
        const current = get().messages.find(m => m.id === assistantMessageId)
        if (!current?.content?.trim()) get().updateMessage(assistantMessageId, `Error: ${msg}`)
      },
      onFinalize: (fullText) => {
        get().setStreaming(false)
        get().markToolCallsDone(assistantMessageId)
        get().updateMessage(assistantMessageId, fullText)
        if (chatId) {
          persistence.appendMessage(chatId, 'assistant', fullText, null)
            .then(() => window.dispatchEvent(new CustomEvent('chats-refresh')))
            .catch((e) => console.warn('db_append_message (assistant) failed', e))
        }
        const stateAfter = get()
        if (stateAfter.messages.length <= 5 && chatId) {
          const userMsg = stateAfter.messages.find(m => m.role === 'user')
          if (userMsg && !stateAfter.currentSystemPrompt?.includes('Generate a short')) {
            stateAfter.generateAutoTitle(chatId, userMsg.content).catch(console.error)
          }
        }
      },
    })

    get().setStreaming(true, assistantMessageId)

    try {
      const { providerId, providerType } = resolveProvider(state.currentModel)
      const latest = get()
      const apiMessages = buildApiMessages(latest.messages, latest.currentSystemPrompt, state.currentModel, providerType)
      await invokeChat(state.currentModel, apiMessages, options, providerId)

      setTimeout(() => {
        const s = get()
        if (s.isStreaming && s.streamingMessageId === assistantMessageId) {
          s.setStreaming(false)
          pipeline.cleanup()
        }
      }, 60000)
    } catch (error) {
      set({ isStreaming: false })
      get().updateMessage(assistantMessageId, `Error: ${error}`)
      pipeline.cleanup()
    }
  },

  editUserMessage: async (messageId, newContent) => {
    const state = get()
    if (state.isStreaming) {
      await state.stopStreaming()
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const msgIndex = state.messages.findIndex(m => m.id === messageId)
    if (msgIndex === -1) { console.error('Message to edit not found'); return }

    const message = state.messages[msgIndex]
    const chatId = state.currentChatId
    if (!chatId) { console.error('No current chat ID'); return }

    try {
      await persistence.updateMessage(messageId, newContent)
      await persistence.deleteMessagesAfter(chatId, message.timestamp)
    } catch (e) {
      console.error('Failed to update/truncate DB for edit:', e)
      return
    }

    const truncated = state.messages.slice(0, msgIndex + 1)
    truncated[msgIndex] = { ...message, content: newContent }
    set({ messages: truncated })

    await new Promise(resolve => setTimeout(resolve, 10))

    const assistantMessageId = get().addMessage({ role: 'assistant', content: '', isStreaming: true })
    const currentModel = get().currentModel

    const pipeline = await createStreamingPipeline({
      onDisplay: (text) => get().updateStreamingMessage(assistantMessageId, text),
      onStreamStart: (streamId) => get().setStreaming(true, assistantMessageId, streamId),
      onToolCall: (tool) => get().updateMessageToolCalls(assistantMessageId, tool),
      onContentStart: () => {
        const msg = get().messages.find(m => m.id === assistantMessageId)
        if (msg?.toolCalls?.some(t => t.status === 'calling')) get().markToolCallsDone(assistantMessageId)
      },
      onCancel: () => get().setStreaming(false),
      onError: (msg) => {
        get().setStreaming(false)
        const current = get().messages.find(m => m.id === assistantMessageId)
        if (!current?.content) get().updateMessage(assistantMessageId, `Error: ${msg}`)
      },
      onFinalize: (fullText) => {
        get().setStreaming(false)
        get().markToolCallsDone(assistantMessageId)
        get().updateMessage(assistantMessageId, fullText)
        if (chatId) {
          persistence.appendMessage(chatId, 'assistant', fullText, null)
            .then(() => window.dispatchEvent(new CustomEvent('chats-refresh')))
            .catch(() => {})
        }
      },
    })

    get().setStreaming(true, assistantMessageId)

    try {
      const { providerId, providerType } = resolveProvider(currentModel)
      const latest = get()
      const apiMessages = buildApiMessages(latest.messages, latest.currentSystemPrompt, currentModel, providerType)
      await invokeChat(currentModel, apiMessages, undefined, providerId)
    } catch (error) {
      get().setStreaming(false)
      get().updateMessage(assistantMessageId, `Error: ${error}`)
      pipeline.cleanup()
    }
  },

  stopStreaming: async () => {
    const state = get()
    if (state.isStreaming) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('chat_cancel', { streamId: state.currentStreamId })
      } catch (error) {
        console.error('Failed to stop streaming:', error)
        state.setStreaming(false)
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], currentChatTitle: null, isLoadingChat: false, isStreaming: false, streamingMessageId: null })
  },

  generateAutoTitle: async (chatId, userContent) => {
    const state = get()
    if (!state.currentModel) return

    const context = userContent.slice(0, 500)
    const { models } = useModelsStore.getState()

    let titleModel = state.currentModel
    const isVLM = ['moondream', 'llava', 'vl'].some(k => state.currentModel.includes(k))
    if (isVLM) {
      const smallModels = ['llama3.2', 'phi', 'tinyllama', 'qwen2.5:0.5b', 'qwen2.5:1.5b', 'gemma2:2b']
      const betterModel = models.find(m => smallModels.some(sm => m.name.includes(sm)))
      if (betterModel) titleModel = betterModel.name
    }

    let titleAccumulator = ''
    let titleStreamId: string | null = null
    let isDone = false

    await (async () => {
      let unlistenChunk: (() => void) | null = null
      let unlistenStart: (() => void) | null = null
      let timeout: ReturnType<typeof setTimeout> | null = null
      let resolveWait!: () => void
      const waitPromise = new Promise<void>((resolve) => { resolveWait = resolve })

      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        if (unlistenChunk) unlistenChunk()
        if (unlistenStart) unlistenStart()
      }
      const resolve = () => { cleanup(); resolveWait() }

      unlistenChunk = await listen<{ stream_id?: string; message?: { content?: string }; done?: boolean }>(
        'chat:chunk',
        (event) => {
          const chunk = event.payload
          if (chunk.stream_id && chunk.stream_id === titleStreamId) {
            if (chunk.message?.content) titleAccumulator += chunk.message.content
            if (chunk.done) { isDone = true; resolve() }
          }
        }
      )

      unlistenStart = await listen<{ stream_id: string }>('chat:stream-start', (event) => {
        if (!titleStreamId) titleStreamId = event.payload.stream_id
      })

      timeout = setTimeout(() => {
        if (!isDone) { console.warn('Auto-Title: timed out'); resolve() }
      }, 60000)

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('chat_stream', {
          request: {
            model: titleModel,
            messages: [
              { role: 'system', content: 'Generate a very short title (3-5 words) for the user message. Output ONLY the title text. Do not use quotes.' },
              { role: 'user', content: `Message: "${context}"` },
            ],
            stream: true,
            options: { temperature: 0.7, max_tokens: titleModel.includes('thinking') || titleModel.includes('r1') ? 2048 : 256 },
          },
        })
      } catch (e) {
        console.error('Auto-title invoke failed', e)
        resolve()
      }

      await waitPromise
    })()

    const stripThink = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    let cleanTitle = stripThink(titleAccumulator).replace(/["']/g, '').trim()
    if (!cleanTitle && context.length > 0) cleanTitle = context.split(' ').slice(0, 4).join(' ') + '...'

    if (cleanTitle) {
      await persistence.setChatTitle(chatId, cleanTitle)
      if (get().currentChatId === chatId) set({ currentChatTitle: cleanTitle })
      window.dispatchEvent(new CustomEvent('chats-refresh'))
    }
  },
}))
