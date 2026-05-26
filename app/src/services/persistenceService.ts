import { invoke } from '@tauri-apps/api/core'

export interface DbMessage {
  id: string
  role: string
  content: string
  meta_json?: string | null
  created_at?: number
}

export const persistence = {
  createChat: (model: string | null, systemPrompt: string | null, paramsJson: string | null) =>
    invoke<{ id: string; title?: string | null; system_prompt?: string | null }>(
      'db_create_chat', { model, systemPrompt, paramsJson }
    ),

  appendMessage: (chatId: string, role: string, content: string, metaJson: string | null) =>
    invoke<void>('db_append_message', { chatId, role, content, metaJson }),

  listMessages: (chatId: string) =>
    invoke<DbMessage[]>('db_list_messages', { chatId, limit: 1000 }),

  updateMessage: (id: string, content: string) =>
    invoke<void>('db_update_message', { id, content }),

  deleteMessagesAfter: (chatId: string, timestamp: number) =>
    invoke<void>('db_delete_messages_after', { chatId, timestamp }),

  setChatModel: (chatId: string, model: string) =>
    invoke<void>('db_set_chat_model', { chatId, model }),

  setChatTitle: (chatId: string, title: string) =>
    invoke<void>('db_set_chat_title', { chatId, title }),
}
