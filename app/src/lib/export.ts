import type { ChatMessage } from '../store/chatStore'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'chat'
}

export function exportChatAsMarkdown(
  title: string | null | undefined,
  model: string | null | undefined,
  messages: ChatMessage[],
): void {
  const date = new Date().toISOString().slice(0, 10)
  const displayTitle = title || 'Chat'
  const lines: string[] = [
    `# ${displayTitle}`,
    '',
    `**Model:** ${model || 'unknown'}`,
    `**Date:** ${date}`,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    if (msg.role === 'system') continue
    const speaker = msg.role === 'user' ? 'You' : 'Ollie'
    lines.push(`**${speaker}:**`)
    lines.push('')

    if (msg.files && msg.files.length > 0) {
      for (const f of msg.files) {
        lines.push(`> 📎 File: ${f.name}`)
      }
      lines.push('')
    }

    if (msg.images && msg.images.length > 0) {
      for (let i = 0; i < msg.images.length; i++) {
        lines.push(`> 🖼️ Image ${i + 1}`)
      }
      lines.push('')
    }

    lines.push(msg.content.trim())
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  const md = lines.join('\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(displayTitle)}-${date}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
