import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../store/settingsStore'
import { useModelsStore } from '../store/modelsStore'
import { trimToContextBudget } from '../lib/contextBudget'
import type { ChatMessage, ChatOptions } from '../store/chatStore'

export function buildLlmContent(msg: ChatMessage): string {
  if (!msg.files?.length) return msg.content
  return msg.content + msg.files.map(f => `\n\n--- File: ${f.name} ---\n${f.content}\n---`).join('')
}

export function resolveProvider(model: string): { providerId: string; providerType: string } {
  const { activeProviderId, providers, appMode } = useSettingsStore.getState()
  const { models } = useModelsStore.getState()

  let providerId = activeProviderId
  const isLocalModel = models.some(m => m.name === model)
  const ollamaProvider = providers.find(p => p.provider_type === 'ollama')

  if (isLocalModel && ollamaProvider) {
    providerId = ollamaProvider.id
  } else if (appMode === 'local' && ollamaProvider) {
    providerId = ollamaProvider.id
  }

  const resolved = providers.find(p => p.id === providerId)
  return { providerId, providerType: resolved?.provider_type ?? 'other' }
}

export function buildApiMessages(
  messages: ChatMessage[],
  systemPrompt: string | null,
  model: string,
  providerType: string,
): { role: string; content: string; images?: string[] }[] {
  const raw = messages
    .filter(msg => msg.role !== 'assistant' || msg.content.trim() !== '')
    .map(msg => ({ role: msg.role, content: buildLlmContent(msg), images: msg.images }))

  const trimmed = trimToContextBudget(raw, systemPrompt, providerType, model)
  const apiMessages = [...trimmed]

  if (systemPrompt) {
    apiMessages.unshift({ role: 'system', content: systemPrompt, images: undefined })
  }
  return apiMessages
}

export async function invokeChat(
  model: string,
  messages: { role: string; content: string; images?: string[] }[],
  options: ChatOptions | undefined,
  providerId: string,
): Promise<void> {
  await invoke('chat_stream', {
    request: {
      model,
      messages,
      stream: true,
      options: options ? {
        temperature: options.temperature,
        top_k: options.topK,
        top_p: options.topP,
        max_tokens: options.maxTokens,
      } : undefined,
    },
    providerId,
  })
}
