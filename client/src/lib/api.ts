import axios from 'axios'

// Track active uploads — prevent page redirects while uploading
let activeUploads = 0
export const uploadStarted = () => { activeUploads++ }
export const uploadFinished = () => { activeUploads = Math.max(0, activeUploads - 1) }
export const isUploading = () => activeUploads > 0

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !isUploading()) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
