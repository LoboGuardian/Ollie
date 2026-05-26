import { listen } from '@tauri-apps/api/event'
import type { ToolCallState } from '../store/chatStore'

const DRIP_MS = 30
const RENDER_THROTTLE_MS = 100  // push to React at most 10fps

export interface StreamingPipelineCallbacks {
  onDisplay: (text: string) => void
  onFinalize: (fullText: string) => void
  onCancel: () => void
  onError: (msg: string) => void
  onStreamStart: (streamId: string) => void
  onToolCall: (tool: ToolCallState) => void
  onContentStart: () => void  // called when first content token arrives (for marking tool calls done)
}

export interface StreamingPipeline {
  cleanup: (discard?: boolean) => void
  getStreamId: () => string | null
}

export async function createStreamingPipeline(
  callbacks: StreamingPipelineCallbacks,
): Promise<StreamingPipeline> {
  let pendingText = ''
  let displayedContent = ''
  let dripIntervalId: ReturnType<typeof setInterval> | null = null
  let streamDone = false
  let lastRenderPush = 0
  let currentStreamId: string | null = null
  let finalized = false

  const dripTick = () => {
    if (pendingText.length === 0) {
      if (streamDone && !finalized) {
        finalized = true
        if (dripIntervalId) { clearInterval(dripIntervalId); dripIntervalId = null }
        callbacks.onFinalize(displayedContent)
        unlistenAll()
      }
      return
    }

    let batchSize: number
    if (pendingText.length <= 4) {
      batchSize = pendingText.length
    } else if (pendingText.length < 100) {
      batchSize = 3
    } else {
      batchSize = Math.min(Math.ceil(pendingText.length / 15), 25)
    }

    const batch = pendingText.slice(0, batchSize)
    pendingText = pendingText.slice(batchSize)
    displayedContent += batch

    const now = Date.now()
    if (now - lastRenderPush >= RENDER_THROTTLE_MS) {
      callbacks.onDisplay(displayedContent)
      lastRenderPush = now
    }
  }

  const startDrip = () => {
    if (!dripIntervalId) dripIntervalId = setInterval(dripTick, DRIP_MS)
  }

  const signalDone = () => {
    streamDone = true
    if (pendingText.length === 0) dripTick()
  }

  const cleanup = (discard = false) => {
    if (dripIntervalId) { clearInterval(dripIntervalId); dripIntervalId = null }
    if (discard) {
      pendingText = ''
    } else if (pendingText.length > 0) {
      displayedContent += pendingText
      pendingText = ''
      callbacks.onDisplay(displayedContent)
    }
    unlistenAll()
  }

  const unlistenStreamStart = await listen<{ stream_id: string }>('chat:stream-start', (event) => {
    currentStreamId = event.payload.stream_id
    callbacks.onStreamStart(currentStreamId)
  })

  const unlistenToolStart = await listen<{ stream_id: string; tool: string; args: ToolCallState['args'] }>(
    'chat:tool-start',
    (event) => {
      if (event.payload.stream_id === currentStreamId) {
        callbacks.onToolCall({
          id: `tool_${Date.now()}_${Math.random()}`,
          name: event.payload.tool,
          args: event.payload.args,
          status: 'calling',
        })
      }
    }
  )

  const unlistenCancelled = await listen<{ stream_id: string }>('chat:cancelled', (event) => {
    if (event.payload.stream_id === currentStreamId) {
      cleanup(true)
      callbacks.onCancel()
    }
  })

  const unlistenChunk = await listen<{ stream_id?: string; message?: { content?: string }; done?: boolean }>(
    'chat:chunk',
    (event) => {
      const chunk = event.payload
      if (chunk.stream_id && currentStreamId && chunk.stream_id !== currentStreamId) return

      const part = chunk.message?.content ?? ''
      if (part.length > 0) {
        callbacks.onContentStart()
        pendingText += part
        startDrip()
      }
      if (chunk.done) signalDone()
    }
  )

  const unlistenError = await listen<{ stream_id?: string; error?: string }>('chat:error', (event) => {
    const payload = event.payload
    if (payload?.stream_id && payload.stream_id !== currentStreamId) return
    cleanup()
    callbacks.onError(payload?.error || 'Failed to get response from model')
  })

  const unlistenComplete = await listen<{ completed: boolean; stream_id?: string }>('chat:complete', (event) => {
    if (event.payload.stream_id && event.payload.stream_id !== currentStreamId) return
    signalDone()
  })

  const unlistenAll = () => {
    unlistenStreamStart()
    unlistenToolStart()
    unlistenCancelled()
    unlistenChunk()
    unlistenError()
    unlistenComplete()
  }

  return { cleanup, getStreamId: () => currentStreamId }
}
