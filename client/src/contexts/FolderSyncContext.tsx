import { createContext, useContext, ReactNode } from 'react'
import { useFolderSync, FolderSyncAPI } from '../lib/useFolderSync'

const FolderSyncContext = createContext<FolderSyncAPI | null>(null)

export function FolderSyncProvider({ children }: { children: ReactNode }) {
  const sync = useFolderSync()
  return <FolderSyncContext.Provider value={sync}>{children}</FolderSyncContext.Provider>
}

export function useFolderSyncContext(): FolderSyncAPI {
  const ctx = useContext(FolderSyncContext)
  if (!ctx) throw new Error('useFolderSyncContext must be used inside FolderSyncProvider')
  return ctx
}
