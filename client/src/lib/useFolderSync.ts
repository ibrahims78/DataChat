import { useState, useEffect, useCallback } from 'react'

const DB_NAME = 'datachat-fs'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'syncFolder'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function persistHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      if (handle) store.put(handle, HANDLE_KEY)
      else store.delete(HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

export type PermState = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'loading'

export interface FolderSync {
  isSupported: boolean
  dirHandle: FileSystemDirectoryHandle | null
  folderName: string | null
  permState: PermState
  pickFolder: () => Promise<void>
  removeFolder: () => Promise<void>
  requestPermission: () => Promise<boolean>
  saveFile: (filename: string, blob: Blob) => Promise<'saved' | 'no_folder' | 'denied' | 'error'>
}

export function useFolderSync(): FolderSync {
  const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [permState, setPermState] = useState<PermState>('loading')

  useEffect(() => {
    if (!isSupported) { setPermState('unsupported'); return }
    loadHandle().then(async (handle) => {
      if (!handle) { setPermState('prompt'); return }
      try {
        const perm = await handle.queryPermission({ mode: 'readwrite' })
        setDirHandle(handle)
        setPermState(perm as PermState)
      } catch { setPermState('prompt') }
    })
  }, [isSupported])

  const pickFolder = useCallback(async () => {
    if (!isSupported) return
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'datachat-sync' })
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      setDirHandle(handle)
      setPermState(perm as PermState)
      await persistHandle(handle)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('pickFolder error:', e)
    }
  }, [isSupported])

  const removeFolder = useCallback(async () => {
    setDirHandle(null)
    setPermState('prompt')
    await persistHandle(null)
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!dirHandle) return false
    try {
      const perm = await dirHandle.requestPermission({ mode: 'readwrite' })
      setPermState(perm as PermState)
      return perm === 'granted'
    } catch { return false }
  }, [dirHandle])

  const saveFile = useCallback(async (
    filename: string,
    blob: Blob
  ): Promise<'saved' | 'no_folder' | 'denied' | 'error'> => {
    if (!dirHandle) return 'no_folder'
    try {
      let perm = await dirHandle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        perm = await dirHandle.requestPermission({ mode: 'readwrite' })
        setPermState(perm as PermState)
      }
      if (perm !== 'granted') return 'denied'
      // Sanitize filename for filesystem
      const safe = filename.replace(/[<>:"/\\|?*]/g, '_')
      const fileHandle = await dirHandle.getFileHandle(safe, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (e: any) {
      if (e.name === 'NotAllowedError') return 'denied'
      console.error('saveFile error:', e)
      return 'error'
    }
  }, [dirHandle])

  return {
    isSupported,
    dirHandle,
    folderName: dirHandle?.name ?? null,
    permState,
    pickFolder,
    removeFolder,
    requestPermission,
    saveFile,
  }
}
