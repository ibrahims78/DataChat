import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import { useEffect } from 'react'
import api from '../../lib/api'
import { useNavigate } from 'react-router-dom'

export default function Layout() {
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/auth/setup-required').then(res => {
      if (res.data.required) navigate('/setup')
    }).catch(() => {})
  }, [])

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
