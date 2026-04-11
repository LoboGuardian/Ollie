import { useState } from 'react'
import { useModelsStore } from '../store/modelsStore'
import { Download, Trash2, Info, Check, X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import ProgressBar from './ProgressBar'
import ModelInfoModal from './ModelInfoModal'
import type { ModelInfo } from '../store/modelsStore'

const RECOMMENDED_MODELS = [
	{ name: 'llama3.2', description: 'Meta\'s latest lightweight model, great for speed.', size: '2.0 GB', tags: ['Fast', 'General'] },
	{ name: 'deepseek-r1:1.5b', description: 'Excellent reasoning capabilities, distilled from R1.', size: '1.2 GB', tags: ['Reasoning', 'Smart'] },
	{ name: 'mistral', description: 'Strong all-rounder with good reasoning.', size: '4.1 GB', tags: ['Balanced'] },
	{ name: 'gemma2:2b', description: 'Google\'s open model with high performance.', size: '1.6 GB', tags: ['General'] },
	{ name: 'qwen2.5-coder:1.5b', description: 'Specialized for code generation and analysis.', size: '1.0 GB', tags: ['Coding'] },
]

const RECOMMENDED_VISION_MODELS = [
	{ name: 'moondream', description: 'Tiny but mighty vision model. Runs fast on any device.', size: '1.7 GB', tags: ['Vision', 'Fast'] },
	{ name: 'llava', description: 'The classic open vision assistant. Reliable performance.', size: '4.5 GB', tags: ['Vision', 'Balanced'] },
	{ name: 'qwen2.5-vl:3b', description: 'State-of-the-art visual understanding from Qwen.', size: '3.2 GB', tags: ['Vision', 'Smart'] },
]

export default function ModelPicker() {
	const { models, fetchModels, pullModel, deleteModel, showModel, pulls } = useModelsStore()
	const { setCurrentModel, currentModel } = useChatStore()
	const { setDefaultModel, saveSettingsToBackend, defaultModel } = useSettingsStore()
	const [newModel, setNewModel] = useState('')
	const [selectedModelInfo, setSelectedModelInfo] = useState<{ name: string, info: ModelInfo } | null>(null)

	return (
		<div className="space-y-6">
			<div className="flex gap-3">
				<input
					value={newModel}
					onChange={(e) => setNewModel(e.target.value)}
					placeholder="llama3:instruct"
					className="ui-input flex-1 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent transition-all duration-200"
				/>
				<button
					onClick={() => newModel.trim() && pullModel(newModel.trim())}
					className="ui-button-primary px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5"
				>
					Pull
				</button>
				<button
					onClick={fetchModels}
					className="ui-surface px-6 py-3 ui-heading hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-all duration-200 transform hover:-translate-y-0.5"
				>
					Refresh
				</button>
			</div>

			<div className="flex justify-end -mt-3 mb-2">
				<button
					onClick={() => import('@tauri-apps/plugin-shell').then(({ open }) => open('https://ollama.com/library'))}
					className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
				>
					Browse available models on Ollama Library
				</button>
			</div>

			{/* Active pulls moved to top for visibility */}
			{Object.entries(pulls).length > 0 && (
				<div className="space-y-3 mb-6">
					<h3 className="ui-heading text-sm font-semibold mb-3 flex items-center gap-2">
						<Download size={16} className="ui-heading" />
						Active Downloads
					</h3>
					{Object.entries(pulls).map(([id, p]: any) => (
						<div key={id} className="ui-surface rounded-xl p-4 shadow-sm border-l-4 border-l-gray-900">
							<div className="flex items-center justify-between mb-3">
								<div className="text-md font-medium ui-heading">{p.name}</div>
								<div className="flex items-center gap-2">
									<div className="ui-chip text-xs font-mono">
										{p.status}
									</div>
									{p.status !== 'complete' && p.status !== 'error' && (
										<button
											onClick={() => useModelsStore.getState().cancelPull(id)}
											className="ui-muted p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded hover:text-red-500 transition-colors"
											title="Stop download"
										>
											<X size={14} />
										</button>
									)}
								</div>
							</div>
							{p.progress && (
								<div className="space-y-2">
									{(() => {
										const prog = p.progress || {}
										const completed = Number(prog.completed ?? prog.downloaded ?? 0)
										const total = Number(prog.total ?? prog.size ?? 0)
										const percent = total > 0 ? Math.floor((completed / total) * 100) : 0
										return <ProgressBar value={percent} />
									})()}
									<div className="flex justify-between text-xs ui-muted font-mono">
										<span>
											{(() => {
												const prog = p.progress || {}
												const completed = Number(prog.completed ?? prog.downloaded ?? 0)
												const total = Number(prog.total ?? prog.size ?? 0)
												return total > 0 ? `${(completed / 1e6).toFixed(1)}MB / ${(total / 1e6).toFixed(1)}MB` : p.status
											})()}
										</span>
										<span>
											{(() => {
												const prog = p.progress || {}
												const completed = Number(prog.completed ?? prog.downloaded ?? 0)
												const total = Number(prog.total ?? prog.size ?? 0)
												return total > 0 ? `${Math.floor((completed / total) * 100)}%` : ''
											})()}
										</span>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}


			{/* Recommended Models */}
			<div className="space-y-3">
				<h3 className="ui-heading text-sm font-semibold">Recommended Models</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{RECOMMENDED_MODELS.filter(rm => !models.some(m => m.name.startsWith(rm.name.split(':')[0]))).map((rm) => (
						<div key={rm.name} className="ui-surface rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
							<div className="flex justify-between items-start mb-2">
								<div className="font-semibold ui-heading">{rm.name}</div>
								<div className="ui-chip">{rm.size}</div>
							</div>
							<p className="text-sm ui-muted mb-4 flex-1">{rm.description}</p>
							<div className="flex items-center justify-between mt-auto">
								<div className="flex gap-2">
									{rm.tags.map(tag => (
										<span key={tag} className="text-[10px] font-medium px-2 py-1 bg-gray-50 dark:bg-gray-700 ui-muted rounded-md border border-gray-100 dark:border-gray-600">
											{tag}
										</span>
									))}
								</div>
								<button
									onClick={() => pullModel(rm.name)}
									className="ui-button-primary p-2 rounded-lg transition-colors"
									title={`Download ${rm.name}`}
								>
									<Download size={16} />
								</button>
							</div>
						</div>
					))}
					{RECOMMENDED_MODELS.every(rm => models.some(m => m.name.startsWith(rm.name.split(':')[0]))) && (
						<div className="col-span-full py-8 text-center ui-muted bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
							All recommended chat models are installed! 🎉
						</div>
					)}
				</div>
			</div>

			{/* Recommended Vision Models */}
			<div className="space-y-3">
				<h3 className="ui-heading text-sm font-semibold flex items-center gap-2">
					<span>Recommended Vision Models</span>
					<span className="text-xs font-normal ui-muted bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">For images</span>
				</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{RECOMMENDED_VISION_MODELS.filter(rm => !models.some(m => m.name.startsWith(rm.name.split(':')[0]))).map((rm) => (
						<div key={rm.name} className="ui-surface rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
							<div className="flex justify-between items-start mb-2">
								<div className="font-semibold ui-heading">{rm.name}</div>
								<div className="ui-chip">{rm.size}</div>
							</div>
							<p className="text-sm ui-muted mb-4 flex-1">{rm.description}</p>
							<div className="flex items-center justify-between mt-auto">
								<div className="flex gap-2">
									{rm.tags.map(tag => (
										<span key={tag} className="text-[10px] font-medium px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md border border-purple-100 dark:border-purple-800">
											{tag}
										</span>
									))}
								</div>
								<button
									onClick={() => pullModel(rm.name)}
									className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
									title={`Download ${rm.name}`}
								>
									<Download size={16} />
								</button>
							</div>
						</div>
					))}
					{RECOMMENDED_VISION_MODELS.every(rm => models.some(m => m.name.startsWith(rm.name.split(':')[0]))) && (
						<div className="col-span-full py-8 text-center ui-muted bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
							All recommended vision models are installed! 👁️
						</div>
					)}
				</div>
			</div>

			<div className="ui-surface rounded-2xl shadow-sm overflow-hidden">
				{models.map((m, index) => (
					<div key={m.name} className={`p-4 flex items-center justify-between gap-4 group transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-800 ${index !== models.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold ui-heading truncate mb-1">{m.name}</div>
							<div className="text-xs ui-muted truncate">{(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB</div>
						</div>
						<div className="flex items-center gap-2 flex-shrink-0">
							<button className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${currentModel === m.name
								? 'ui-button-primary border-gray-900'
								: 'ui-surface ui-heading hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
								}`}
								onClick={() => setCurrentModel(m.name)}
							>
								{currentModel === m.name ? 'In use' : 'Use'}
							</button>
							<button
								className="ui-icon-button"
								onClick={async () => {
									const info = await showModel(m.name)
									if (info) setSelectedModelInfo({ name: m.name, info })
								}}
								title="Model Info"
							>
								<Info size={16} />
							</button>
							<button className="ui-icon-button" onClick={() => pullModel(m.name)} title="Update Model">
								<Download size={16} />
							</button>
							<button className="ui-icon-button-danger" onClick={() => deleteModel(m.name)} title="Delete Model">
								<Trash2 size={16} />
							</button>
							<button
								className={`p-2.5 rounded-xl transition-all duration-200 ${defaultModel === m.name
									? 'text-green-600 bg-green-50 dark:bg-green-900/30'
									: 'ui-muted hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
									}`}
								title={defaultModel === m.name ? 'Default model' : 'Set as default'}
								onClick={async () => { setDefaultModel(m.name); await saveSettingsToBackend(); }}
							>
								<Check size={16} />
							</button>
						</div>
					</div>
				))}
			</div>



			{selectedModelInfo && (
				<ModelInfoModal
					modelName={selectedModelInfo.name}
					info={selectedModelInfo.info}
					onClose={() => setSelectedModelInfo(null)}
				/>
			)}
		</div>
	)
}
