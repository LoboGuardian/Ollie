import { User, Copy, Check, Pencil, Wrench, Loader2 } from 'lucide-react'
import { useState, memo } from 'react'
import { useChatStore, type ChatMessage } from '../store/chatStore'
import Markdown from '../lib/markdown'
import TextareaAutosize from 'react-textarea-autosize'

interface MessageProps {
  message: ChatMessage
}

function Message({ message }: MessageProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const editUserMessage = useChatStore(state => state.editUserMessage)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditContent(message.content)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent(message.content)
  }

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      editUserMessage(message.id, editContent)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const isUser = message.role === 'user'

  return (
    <div className={`w-full flex items-start gap-4 py-5 px-1 ${isUser ? 'bg-gray-50/30 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-900'} group border-b border-gray-100/40 dark:border-gray-800 last:border-b-0`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser
        ? 'bg-gray-800 dark:bg-gray-700'
        : 'ui-surface shadow-sm'
        }`}>
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <img src="/ollie-logo.png" alt="Ollie" className="w-5 h-5 object-contain" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className={`text-xs font-medium mb-2 ${isUser ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
              }`}>
              {isUser ? 'You' : 'Ollie'}
            </div>

            {isEditing ? (
              <div className="ui-surface border-blue-200 dark:border-blue-800 rounded-xl p-3 shadow-sm">
                <TextareaAutosize
                  value={editContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full resize-none outline-none bg-transparent text-gray-900 dark:text-gray-100 text-base leading-relaxed"
                  minRows={1}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={handleCancelEdit}
                    className="ui-muted px-3 py-1.5 text-xs font-medium hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    Save & Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Tool Calls */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="flex flex-col gap-2 mb-4">
                    {message.toolCalls.map((tool) => (
                      <div key={tool.id} className="ui-surface flex items-center gap-2 text-sm ui-muted rounded-lg px-3 py-2 w-fit max-w-full">
                        {tool.status === 'calling' ? (
                          <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />
                        ) : (
                          <Wrench size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-700 dark:text-gray-200 flex-shrink-0">{tool.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate hidden sm:inline-block opacity-70">
                          {JSON.stringify(tool.args)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attached Images */}
                {message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    {message.images.map((img, i) => (
                      <div key={i} className="ui-surface relative rounded-xl overflow-hidden shadow-sm">
                        <img
                          src={`data:image/png;base64,${img}`}
                          alt="Attachment"
                          className="max-w-xs max-h-64 object-cover block"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Content */}
                <div className="max-w-full overflow-hidden text-gray-900 dark:text-gray-100 leading-relaxed text-sm">
                  {isUser ? (
                    <div className="whitespace-pre-wrap text-blue-900 dark:text-blue-200">
                      {message.content}
                    </div>
                  ) : (
                    (() => {
                      // Handle DeepSeek <think> blocks
                      const thinkMatch = message.content.match(/<think>([\s\S]*?)<\/think>/)
                      const thinkContent = thinkMatch ? thinkMatch[1] : null
                      const cleanContent = message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

                      return (
                        <>
                          {thinkContent && (
                            <details className="mb-4 group">
                              <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 select-none flex items-center gap-1">
                                <span className="opacity-50 group-open:opacity-100 transition-opacity">💭 Thought Process</span>
                              </summary>
                              <div className="mt-2 pl-3 border-l-2 border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-pre-wrap">
                                {thinkContent}
                              </div>
                            </details>
                          )}
                          <Markdown content={cleanContent || (message.isStreaming && !thinkContent ? '' : message.content)} isStreaming={message.isStreaming} />
                        </>
                      )
                    })()
                  )}

                  {message.isStreaming && !isUser && (
                    <span className="inline-block w-2 h-5 bg-gray-400 dark:bg-gray-500 animate-pulse ml-1 rounded-full align-middle"></span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 self-start mt-[-2px]">
            {/* Edit Button (User only) */}
            {isUser && !isEditing && (
              <button
                onClick={handleEdit}
                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-all"
                title="Edit message"
              >
                <Pencil size={14} />
              </button>
            )}

            {/* Copy button */}
            {!isUser && !isEditing && message.content && (
              <button
                onClick={copyToClipboard}
                className="ui-muted p-1.5 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                title="Copy message"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(Message, (prev, next) => {
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.isStreaming !== next.message.isStreaming) return false
  if (prev.message.toolCalls !== next.message.toolCalls) return false
  return true
})
