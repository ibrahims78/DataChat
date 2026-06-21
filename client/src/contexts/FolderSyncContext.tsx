import { createContext, useContext, ReactNode } from 'react'
import { useFolderSync, FolderSync } from '../lib/useFolderSync'

const FolderSyncContext = createContext<FolderSync | null>(null)

export function FolderSyncProvider({ children }: { children: ReactNode }) {
  const sync = useFolderSync()
  return <FolderSyncContext.Provider value={sync}>{children}</FolderSyncContext.Provider>
}

export function useFolderSyncContext(): FolderSync {
  const ctx = useContext(FolderSyncContext)
  if (!ctx) throw new Error('useFolderSyncContext must be used inside FolderSyncProvider')
  return ctx
}
