import { useState, useEffect, useCallback } from 'react'

// ─── IndexedDB ──────────────────────────────────────────────────────────────────
const DB_NAME    = 'datachat-fs'
const STORE_NAME = 'handles'
const FOLDERS_KEY = 'syncFolders'
const LEGACY_KEY  = 'syncFolder'   // old single-folder key — migrate on load

interface StoredFolder {
  handle: FileSystemDirectoryHandle
  datedSave: boolean
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror  = () => reject(req.error)
  })
}

async function dbLoadFolders(): Promise<StoredFolder[]> {
  try {
    const db = await openDb()
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(FOLDERS_KEY)
      req.onsuccess = () => {
        if (req.result) { resolve(req.result); return }
        // Migrate legacy single-folder handle
        const legReq = store.get(LEGACY_KEY)
        legReq.onsuccess = () => {
          if (legReq.result) {
            const migrated: StoredFolder[] = [{ handle: legReq.result, datedSave: false }]
            store.put(migrated, FOLDERS_KEY)
            store.delete(LEGACY_KEY)
            resolve(migrated)
          } else {
            resolve([])
          }
        }
        legReq.onerror = () => resolve([])
      }
      req.onerror = () => resolve([])
    })
  } catch { return [] }
}

async function dbSaveFolders(folders: StoredFolder[]): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(folders, FOLDERS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch {}
}

// ─── Types ──────────────────────────────────────────────────────────────────────
export type PermState = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'loading'
export type SaveResult = 'saved' | 'no_folder' | 'denied' | 'error'

export interface FolderEntry {
  handle: FileSystemDirectoryHandle
  name: string
  perm: 'granted' | 'prompt' | 'denied'
  datedSave: boolean
}

export interface FileInfo {
  name: string
  path: string       // relative to folder root (e.g. "subdir/file.xlsx")
  size: number
  lastModified: number
  fileHandle: FileSystemFileHandle
}

export interface SaveFileOpts {
  dated?: boolean        // override per-folder datedSave setting
  targetFolder?: string  // folder name to save to; default = primary (first granted)
}

export interface FolderSyncAPI {
  isSupported: boolean
  loading: boolean
  folders: FolderEntry[]
  primaryFolder: FolderEntry | null

  // Convenience shortcuts (primary folder)
  folderName: string | null
  permState: PermState

  // Folder management
  addFolder:          ()                             => Promise<void>
  removeFolder:       (name: string)                 => Promise<void>
  requestPermission:  (name: string)                 => Promise<boolean>
  toggleDatedSave:    (name: string)                 => Promise<void>

  // File operations
  saveFile:          (filename: string, blob: Blob, opts?: SaveFileOpts)                              => Promise<SaveResult>
  listFiles:         (folderName: string, recursive?: boolean)                                        => Promise<FileInfo[]>
  listAllFiles:      (recursive?: boolean)                                                            => Promise<FileInfo[]>
  readFileBlob:      (fh: FileSystemFileHandle)                                                       => Promise<Blob | null>
  createDirectory:   (folderName: string, dirPath: string)                                            => Promise<'created' | 'no_folder' | 'denied' | 'error'>
  writeFileContent:  (folderName: string, filePath: string, content: string | Blob, mimeType?: string) => Promise<SaveResult>

  // Legacy — single-folder compat (used by ProjectPage auto-save)
  pickFolder:         ()                             => Promise<void>
  removeFolder_:      ()                             => Promise<void>
  requestPermission_: ()                             => Promise<boolean>
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
async function checkPerm(handle: FileSystemDirectoryHandle): Promise<'granted' | 'prompt' | 'denied'> {
  try {
    const p = await handle.queryPermission({ mode: 'readwrite' })
    return p as 'granted' | 'prompt' | 'denied'
  } catch { return 'prompt' }
}

async function listDirFiles(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  recursive = true
): Promise<FileInfo[]> {
  const result: FileInfo[] = []
  try {
    // @ts-expect-error – File System Access API async iterator
    for await (const entry of handle.values()) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile()
          result.push({
            name:        entry.name,
            path:        fullPath,
            size:        file.size,
            lastModified:file.lastModified,
            fileHandle:  entry,
          })
        } catch {}
      } else if (entry.kind === 'directory' && recursive) {
        const sub = await listDirFiles(entry as FileSystemDirectoryHandle, fullPath, recursive)
        result.push(...sub)
      }
    }
  } catch {}
  return result
}

function sanitize(filename: string) {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}

async function writeToDir(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
  datedSave: boolean
): Promise<SaveResult> {
  try {
    let perm = await dirHandle.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') perm = await dirHandle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') return 'denied'

    let targetDir = dirHandle
    if (datedSave) {
      const dateStr = new Date().toISOString().split('T')[0]   // YYYY-MM-DD
      targetDir = await dirHandle.getDirectoryHandle(dateStr, { create: true })
    }
    const safe = sanitize(filename)
    const fh = await targetDir.getFileHandle(safe, { create: true })
    const writable = await fh.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') return 'denied'
    console.error('writeToDir error:', e)
    return 'error'
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────────
export function useFolderSync(): FolderSyncAPI {
  const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  const [loading,  setLoading]  = useState(true)
  const [folders,  setFolders]  = useState<FolderEntry[]>([])

  // Load + check permissions on mount
  useEffect(() => {
    if (!isSupported) { setLoading(false); return }
    dbLoadFolders().then(async stored => {
      const entries: FolderEntry[] = await Promise.all(
        stored.map(async s => ({
          handle:    s.handle,
          name:      s.handle.name,
          perm:      await checkPerm(s.handle),
          datedSave: s.datedSave,
        }))
      )
      setFolders(entries)
      setLoading(false)
    })
  }, [isSupported])

  // Persist whenever folders change (after initial load)
  const persistFolders = useCallback(async (entries: FolderEntry[]) => {
    const stored: StoredFolder[] = entries.map(e => ({ handle: e.handle, datedSave: e.datedSave }))
    await dbSaveFolders(stored)
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addFolder = useCallback(async () => {
    if (!isSupported) return
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'datachat-sync' })
      const perm   = await handle.requestPermission({ mode: 'readwrite' })
      const entry: FolderEntry = { handle, name: handle.name, perm: perm as any, datedSave: false }
      setFolders(prev => {
        // Avoid duplicate names
        const deduped = prev.filter(f => f.name !== handle.name)
        const next = [...deduped, entry]
        persistFolders(next)
        return next
      })
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('addFolder error:', e)
    }
  }, [isSupported, persistFolders])

  const removeFolder = useCallback(async (name: string) => {
    setFolders(prev => {
      const next = prev.filter(f => f.name !== name)
      persistFolders(next)
      return next
    })
  }, [persistFolders])

  const requestPermission = useCallback(async (name: string): Promise<boolean> => {
    const entry = folders.find(f => f.name === name)
    if (!entry) return false
    try {
      const perm = await entry.handle.requestPermission({ mode: 'readwrite' })
      const granted = perm === 'granted'
      setFolders(prev => prev.map(f =>
        f.name === name ? { ...f, perm: perm as any } : f
      ))
      return granted
    } catch { return false }
  }, [folders])

  const toggleDatedSave = useCallback(async (name: string) => {
    setFolders(prev => {
      const next = prev.map(f => f.name === name ? { ...f, datedSave: !f.datedSave } : f)
      persistFolders(next)
      return next
    })
  }, [persistFolders])

  // ── File ops ─────────────────────────────────────────────────────────────────
  const saveFile = useCallback(async (
    filename: string,
    blob: Blob,
    opts: SaveFileOpts = {}
  ): Promise<SaveResult> => {
    let entry = opts.targetFolder
      ? folders.find(f => f.name === opts.targetFolder)
      : folders.find(f => f.perm === 'granted')
    if (!entry) {
      // If no granted folder, try first folder and request permission
      if (!folders.length) return 'no_folder'
      entry = folders[0]
    }
    const dated = opts.dated !== undefined ? opts.dated : entry.datedSave
    const result = await writeToDir(entry.handle, filename, blob, dated)
    if (result === 'denied') {
      setFolders(prev => prev.map(f => f.name === entry!.name ? { ...f, perm: 'denied' } : f))
    }
    return result
  }, [folders])

  const listFiles = useCallback(async (
    folderName: string,
    recursive = false
  ): Promise<FileInfo[]> => {
    const entry = folders.find(f => f.name === folderName)
    if (!entry) return []
    // Request read permission if needed
    try {
      let perm = await entry.handle.queryPermission({ mode: 'read' })
      if (perm !== 'granted') perm = await entry.handle.requestPermission({ mode: 'read' })
      if (perm !== 'granted') return []
    } catch { return [] }
    return listDirFiles(entry.handle, '', recursive)
  }, [folders])

  const readFileBlob = useCallback(async (fh: FileSystemFileHandle): Promise<Blob | null> => {
    try {
      const file = await fh.getFile()
      return file
    } catch { return null }
  }, [])

  const listAllFiles = useCallback(async (recursive = false): Promise<FileInfo[]> => {
    const all: FileInfo[] = []
    for (const entry of folders) {
      try {
        let perm = await entry.handle.queryPermission({ mode: 'read' })
        if (perm !== 'granted') perm = await entry.handle.requestPermission({ mode: 'read' })
        if (perm !== 'granted') continue
        const files = await listDirFiles(entry.handle, '', recursive)
        all.push(...files)
      } catch {}
    }
    return all
  }, [folders])

  const createDirectory = useCallback(async (folderName: string, dirPath: string): Promise<'created' | 'no_folder' | 'denied' | 'error'> => {
    const entry = folders.find(f => f.name === folderName) ?? (folders[0] ?? null)
    if (!entry) return 'no_folder'
    try {
      let perm = await entry.handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') perm = await entry.handle.requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') return 'denied'
      const parts = dirPath.split('/').filter(Boolean)
      let current: FileSystemDirectoryHandle = entry.handle
      for (const part of parts) {
        current = await current.getDirectoryHandle(sanitize(part), { create: true })
      }
      return 'created'
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') return 'denied'
      console.error('createDirectory error:', e)
      return 'error'
    }
  }, [folders])

  const writeFileContent = useCallback(async (
    folderName: string,
    filePath: string,
    content: string | Blob,
    mimeType = 'text/plain'
  ): Promise<SaveResult> => {
    const entry = folders.find(f => f.name === folderName) ?? (folders[0] ?? null)
    if (!entry) return 'no_folder'
    try {
      let perm = await entry.handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') perm = await entry.handle.requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') return 'denied'
      const parts = filePath.split('/').filter(Boolean)
      const fileName = parts.pop()!
      let dir: FileSystemDirectoryHandle = entry.handle
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(sanitize(part), { create: true })
      }
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
      const fh = await dir.getFileHandle(sanitize(fileName), { create: true })
      const writable = await fh.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') return 'denied'
      console.error('writeFileContent error:', e)
      return 'error'
    }
  }, [folders])

  // ── Legacy compat ─────────────────────────────────────────────────────────────
  const primaryFolder = folders.find(f => f.perm === 'granted') ?? (folders[0] ?? null)

  const pickFolder    = addFolder
  const removeFolder_ = useCallback(async () => {
    if (primaryFolder) await removeFolder(primaryFolder.name)
  }, [primaryFolder, removeFolder])
  const requestPermission_ = useCallback(async (): Promise<boolean> => {
    if (primaryFolder) return requestPermission(primaryFolder.name)
    return false
  }, [primaryFolder, requestPermission])

  return {
    isSupported,
    loading,
    folders,
    primaryFolder,
    folderName: primaryFolder?.name ?? null,
    permState: !isSupported
      ? 'unsupported'
      : loading
      ? 'loading'
      : (primaryFolder?.perm ?? 'prompt') as PermState,
    addFolder,
    removeFolder,
    requestPermission,
    toggleDatedSave,
    saveFile,
    listFiles,
    listAllFiles,
    readFileBlob,
    createDirectory,
    writeFileContent,
    pickFolder,
    removeFolder_,
    requestPermission_,
  }
}
