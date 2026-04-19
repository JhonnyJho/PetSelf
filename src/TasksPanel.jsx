import { useEffect, useState, useRef } from 'react'
import './App.css'

const API_BASE = 'http://localhost:4000'

const formatTime = (secs) => {
  if (secs == null) return '—'
  if (secs <= 0) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const TaskRow = ({ task, onComplete, freezeUntil }) => {
  const [remaining, setRemaining] = useState(task.remainingSeconds)
  const mounted = useRef(true)
  const freezeRef = useRef(null)

  useEffect(() => { freezeRef.current = freezeUntil }, [freezeUntil])

  useEffect(() => {
    mounted.current = true
    setRemaining(task.remainingSeconds)
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r == null) return null
        // If freeze is active, don't decrement
        if (freezeRef.current && Date.now() < freezeRef.current) return r
        if (r <= 0) return 0
        return r - 1
      })
    }, 1000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [task.id])

  return (
    <div className="task-row">
      <div className="task-left">
        <strong>{task.title}</strong>
        <div className="task-meta">XP: {task.xp} • {task.isShared ? 'Shared' : 'Personal'}</div>
        {task.durationSeconds != null && (
          <div className="task-progress" aria-hidden>
            <div
              className="task-progress-bar"
              style={{ width: `${Math.round(((task.durationSeconds - (remaining || 0)) / Math.max(task.durationSeconds, 1)) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="task-right">
        {(() => {
          let timeLabel = task.completed ? 'Done' : formatTime(remaining)
          let disabled = false
          if (task.isShared && task.completed && !task.allCompleted) {
            timeLabel = 'Waiting for other user'
            disabled = true
          }
          return (
            <>
              <div className="task-time">{timeLabel}</div>
              <label className="task-complete">
                <input className="task-checkbox" type="checkbox" checked={!!task.completed} disabled={disabled} onChange={() => onComplete(task.id)} />
              </label>
            </>
          )
        })()}
      </div>
    </div>
  )
}

export default function TasksPanel({ onClose }) {
  const [tab, setTab] = useState('ongoing')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [xp, setXp] = useState(5)
  const [durationMinutes, setDurationMinutes] = useState(10)
  const [friendQuery, setFriendQuery] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [selectedFriend, setSelectedFriend] = useState(null)

  const token = localStorage.getItem('authToken')
  const headers = { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, { headers })
      const body = await res.json()
      if (res.ok) {
        // Deduplicate by title (case-insensitive) as a defensive measure
        const rows = body.tasks || []
        const seen = new Set()
        const uniq = []
        for (const t of rows) {
          const key = (t.title || '').trim().toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          uniq.push(t)
        }
        setTasks(uniq)
      } else {
        console.error('Failed to load tasks', body)
      }
    } catch (e) {
      console.error('Fetch tasks error', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  useEffect(() => {
    const id = setInterval(fetchTasks, 15 * 1000) // refresh every 15s
    return () => clearInterval(id)
  }, [])

  // Listen for inventory effects (freeze) to pause timers
  const [freezeUntil, setFreezeUntil] = useState(null)
  useEffect(() => {
    const onEffect = (e) => {
      const eff = e.detail
      if (eff.type === 'freeze') {
        const dur = Number(eff.durationSeconds) || 0
        const until = Date.now() + dur * 1000
        setFreezeUntil(until)
        // Refresh tasks once to sync remaining seconds
        fetchTasks()
        setTimeout(() => setFreezeUntil(null), dur * 1000)
      }
    }
    window.addEventListener('inventoryEffect', onEffect)
    return () => window.removeEventListener('inventoryEffect', onEffect)
  }, [])

  const handleSearchFriends = async (q) => {
    setFriendQuery(q)
    if (!q || q.length < 2) {
      setFriendResults([])
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(q)}`, { headers })
      const body = await res.json()
      if (res.ok) {
        setFriendResults(body.users || [])
      }
    } catch (e) {
      console.error('Search users error', e)
    }
  }

  const handleCreate = async () => {
    if (!title || title.trim().length === 0) return
    const xpValue = Math.min(10, Math.max(0, parseInt(xp, 10) || 0))
    const payload = { title: title.trim(), xp: xpValue, durationSeconds: Math.max(0, parseInt(durationMinutes, 10) || 0) * 60 }
    if (selectedFriend) payload.friendId = selectedFriend.id
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const body = await res.json()
      if (res.ok) {
        setTitle('')
        setXp(5)
        setDurationMinutes(10)
        setSelectedFriend(null)
        setFriendQuery('')
        setFriendResults([])
        setTab('ongoing')
        fetchTasks()
      } else {
        console.error('Create task failed', body)
        alert(body.error || 'Failed to create task')
      }
    } catch (e) {
      console.error('Create task error', e)
    }
  }

  const handleComplete = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/complete`, { method: 'POST', headers })
      const body = await res.json()
      if (res.ok) {
        // If XP was awarded (non-shared) or all participants completed now (shared), ask app to refresh user/pet
        if (body.petXp != null || body.allCompleted) {
          window.dispatchEvent(new Event('refreshUser'))
        }
        fetchTasks()
      } else {
        console.error('Complete failed', body)
      }
    } catch (e) {
      console.error('Complete error', e)
    }
  }

  const ongoing = tasks.filter((t) => !t.completed || (t.isShared && t.completed && !t.allCompleted))
  const completed = tasks.filter((t) => t.completed && t.allCompleted)

  return (
    <div className="tasks-modal-backdrop" onClick={onClose}>
      <div className="tasks-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Tasks</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button className={tab === 'ongoing' ? 'active' : ''} onClick={() => setTab('ongoing')}>Ongoing</button>
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Create</button>
          <button className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>Completed</button>
        </div>

        <div className="tab-body">
          {tab === 'ongoing' && (
            <div>
              {loading && <div>Loading...</div>}
              {!loading && ongoing.length === 0 && <div>No ongoing tasks.</div>}
              {ongoing.map((t) => <TaskRow key={t.id} task={t} onComplete={handleComplete} freezeUntil={freezeUntil} />)}
            </div>
          )}

          {tab === 'completed' && (
            <div>
              {!loading && completed.length === 0 && <div>No completed tasks.</div>}
              {completed.map((t) => (
                <div key={t.id} className="task-row completed">
                  <div className="task-left">
                    <strong>{t.title}</strong>
                    <div className="task-meta">XP: {t.xp} • {t.isShared ? 'Shared' : 'Personal'}</div>
                  </div>
                  <div className="task-right">
                    <div className="task-time">Completed</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'create' && (
            <div className="create-form">
              <label>Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>XP
                <input type="number" min="0" max="10" step="1" value={xp} onChange={(e) => setXp(e.target.value)} />
              </label>
              <label>Duration (minutes)
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
              </label>

              <label>With friend (optional)
                <input value={friendQuery} onChange={(e) => handleSearchFriends(e.target.value)} placeholder="Search nickname" />
              </label>
              {friendResults.length > 0 && (
                <div className="friend-results">
                  {friendResults.map((u) => (
                    <div key={u.id} className={`friend-row ${selectedFriend && selectedFriend.id === u.id ? 'selected' : ''}`} onClick={() => { setSelectedFriend(u); setFriendResults([]); setFriendQuery(u.nickname) }}>
                      {u.nickname}
                    </div>
                  ))}
                </div>
              )}

              <div className="create-actions">
                <button className="primary-btn" onClick={handleCreate}>Create Task</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
