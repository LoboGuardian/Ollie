import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import 'katex/dist/katex.min.css'
import { useState, memo } from 'react'
import { ChevronDown, ChevronRight, Brain, FileText } from 'lucide-react'
import CodeBlock from '../components/CodeBlock'

type Props = {
  content: string
  isStreaming?: boolean
}

function ThoughtDropdown({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!content.trim()) return null

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        {isOpen ? <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" /> : <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />}
        <Brain size={16} className="text-violet-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Thought Process</span>
      </button>

      {isOpen && (
        <div className="p-4 bg-gray-50/50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}

function FileDropdown({ name, content }: { name: string, content: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        {isOpen ? <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" /> : <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />}
        <FileText size={16} className="text-blue-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">File Context: {name}</span>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{content.length} chars</span>
      </button>

      {isOpen && (
        <div className="p-4 bg-gray-50/50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}

// react-markdown component props don't expose clean public TypeScript interfaces,
// so we use eslint-disable for the component map and individual props below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markdownComponents: any = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code(codeProps: any) {
    const { inline, className, children, ...props } = codeProps
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre(preProps: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child: any = Array.isArray(preProps.children) ? preProps.children[0] : preProps.children
    let lang = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inner: any = null

    if (child && child.props) {
      const cls = child.props.className || ''
      const match = /language-(\w+)/.exec(cls)
      lang = match?.[1] || ''
      inner = child.props.children
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractText = (node: any): string => {
      if (!node) return ''
      if (typeof node === 'string') return node
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (node.props && node.props.children) return extractText(node.props.children)
      return ''
    }

    const codeText = extractText(inner)
    return <CodeBlock language={lang} code={codeText}>{inner}</CodeBlock>
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a({ children, ...props }: any) {
    return (
      <a className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline" target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <table className="table-auto divide-y divide-gray-200 dark:divide-gray-700 text-sm" style={{ minWidth: '100%' }}>
          {children}
        </table>
      </div>
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  thead({ children }: any) {
    return <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  th({ children }: any) {
    return <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider whitespace-nowrap">{children}</th>
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  td({ children }: any) {
    return <td className="px-4 py-3 text-gray-500 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 align-top" style={{ minWidth: '120px' }}>{children}</td>
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blockquote({ children }: any) {
    return <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 py-1 my-4 italic text-gray-600 dark:text-gray-300">{children}</blockquote>
  }
}

// Full pipeline (completed messages): GFM tables + syntax highlighting + math + raw HTML (<br> etc.)
const remarkPluginsFull = [remarkGfm, remarkMath]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rehypePluginsFull = [rehypeRaw, [rehypeHighlight, { ignoreMissing: true }] as any, rehypeKatex]

// Lightweight pipeline (streaming): basic markdown only — no GFM tables, no syntax highlighting
// Headers, bold, italic, links, lists, inline code, code blocks all still render
const remarkPluginsStreaming = [remarkMath]
const rehypePluginsStreaming = [rehypeKatex]

/**
 * Extract thought content and file blocks from raw markdown.
 */
function preprocessContent(content: string) {
  let thoughtContent = ''
  let mainContent = content
  const files: { name: string, content: string }[] = []

  // Extract File Blocks
  const fileRegex = /--- File: (.*?) ---\n([\s\S]*?)\n---------------------/g
  let match;
  while ((match = fileRegex.exec(mainContent)) !== null) {
    files.push({ name: match[1], content: match[2].trim() })
  }
  mainContent = mainContent.replace(fileRegex, '')

  const thinkStart = mainContent.indexOf('<think>')
  if (thinkStart !== -1) {
    const thinkEnd = mainContent.indexOf('</think>')
    if (thinkEnd !== -1) {
      thoughtContent = mainContent.substring(thinkStart + 7, thinkEnd)
      mainContent = mainContent.substring(0, thinkStart) + mainContent.substring(thinkEnd + 8)
    } else {
      thoughtContent = mainContent.substring(thinkStart + 7)
      mainContent = mainContent.substring(0, thinkStart)
    }
  }

  return { thoughtContent, mainContent, files }
}

function Markdown({ content, isStreaming }: Props) {
  const { thoughtContent, mainContent, files } = preprocessContent(content)

  // Pre-process LaTeX delimiters
  const processedContent = mainContent
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')

  // Choose plugin set based on streaming state:
  // - Streaming: lightweight (no GFM tables, no syntax highlighting) — keeps up with drip rate
  // - Complete: full pipeline with all formatting
  const activeRemarkPlugins = isStreaming ? remarkPluginsStreaming : remarkPluginsFull
  const activeRehypePlugins = isStreaming ? rehypePluginsStreaming : rehypePluginsFull

  return (
    <div className="markdown-body w-full max-w-full overflow-hidden">
      {thoughtContent && <ThoughtDropdown content={thoughtContent} />}
      {files.map((f, i) => (
        <FileDropdown key={i} name={f.name} content={f.content} />
      ))}

      <div className="prose prose-base max-w-none leading-relaxed dark:prose-invert prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-ol:pl-6 prose-ul:pl-6 prose-li:marker:text-gray-400 dark:prose-li:marker:text-gray-500">
        <ReactMarkdown
          remarkPlugins={activeRemarkPlugins}
          rehypePlugins={activeRehypePlugins}
          components={markdownComponents}
        >
          {processedContent || (thoughtContent ? '' : ' ')}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default memo(Markdown)
