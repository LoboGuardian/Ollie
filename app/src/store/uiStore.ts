import { create } from 'zustand'

type View = 'chat' | 'models' | 'settings' | 'monitoring'
const SIDEBAR_COLLAPSED_KEY = 'ollie.sidebarCollapsed'

const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
}

const persistSidebarCollapsed = (collapsed: boolean) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
}

interface UIState {
  view: View
  sidebarCollapsed: boolean
  zenMode: boolean
  setView: (v: View) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setZenMode: (enabled: boolean) => void
  toggleZenMode: () => void
}

export const useUIStore = create<UIState>((set) => ({
  view: 'chat',
  sidebarCollapsed: getInitialSidebarCollapsed(),
  zenMode: false,
  setView: (view) => set((state) => ({
    view,
    zenMode: view === 'chat' ? state.zenMode : false,
  })),
  setSidebarCollapsed: (sidebarCollapsed) => {
    persistSidebarCollapsed(sidebarCollapsed)
    set({ sidebarCollapsed })
  },
  toggleSidebar: () => set((state) => {
    const sidebarCollapsed = !state.sidebarCollapsed
    persistSidebarCollapsed(sidebarCollapsed)
    return { sidebarCollapsed }
  }),
  setZenMode: (zenMode) => set({ zenMode }),
  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),
}))
