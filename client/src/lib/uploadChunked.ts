import api from './api'

const CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB per chunk

export async function uploadChunked(
  file: File,
  projectId: number,
  onProgress: (percent: number) => void
): Promise<{ file: any; preview: any }> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const formData = new FormData()
    formData.append('chunk', chunk, file.name)
    formData.append('uploadId', uploadId)
    formData.append('chunkIndex', String(i))
    formData.append('totalChunks', String(totalChunks))

    // Do NOT set Content-Type manually — let the browser set it with the correct boundary
    await api.post(`/files/${projectId}/upload-chunk`, formData)

    // 0–90% = sending chunks, last 10% = assembling
    onProgress(Math.round(((i + 1) / totalChunks) * 90))
  }

  onProgress(95)
  const res = await api.post(`/files/${projectId}/assemble-chunks`, {
    uploadId,
    fileName: file.name,
    totalChunks: String(totalChunks),
  })
  onProgress(100)
  return res.data
}
