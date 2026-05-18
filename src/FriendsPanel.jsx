import { useState, useEffect } from 'react'
import { apiUrl } from './api'

export default function FriendsPanel({ onClose }) {
  const [tab, setTab] = useState('friends')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [blocked, setBlocked] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null

  useEffect(() => {
    if (!token) return
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (tab === 'find') {
      doSearch(search)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab])

  async function fetchAll() {
    await Promise.all([fetchFriends(), fetchIncoming(), fetchOutgoing(), fetchBlocked()])
  }

  async function fetchFriends() {
    try {
      const res = await fetch(apiUrl('/api/friends'), { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setFriends(body.friends || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchIncoming() {
    try {
      const res = await fetch(apiUrl('/api/friends/requests/incoming'), { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setIncoming(body.requests || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchOutgoing() {
    try {
      const res = await fetch(apiUrl('/api/friends/requests/outgoing'), { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setOutgoing(body.requests || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchBlocked() {
    try {
      const res = await fetch(apiUrl('/api/users/blocked'), { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setBlocked(body.blocked || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function doSearch(q) {
    setLoading(true)
    try {
      let url = apiUrl('/api/users/search')
      if (q && q.trim().length > 0) {
        url += `?q=${encodeURIComponent(q)}`
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setResults(body.users || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function sendRequest(nickname) {
    try {
      const res = await fetch(apiUrl('/api/friends/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toNickname: nickname }),
      })
      const body = await res.json()
      if (!res.ok) {
        alert(body.error || 'Unable to send request')
        return
      }
      await fetchOutgoing()
    } catch (err) {
      console.error(err)
    }
  }

  async function acceptRequest(id) {
    try {
      const res = await fetch(apiUrl(`/api/friends/requests/${id}/accept`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function declineRequest(id) {
    try {
      const res = await fetch(apiUrl(`/api/friends/requests/${id}/decline`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function cancelRequest(id) {
    try {
      const res = await fetch(apiUrl(`/api/friends/requests/${id}/cancel`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) await fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  async function blockUser(nickname) {
    try {
      const res = await fetch(apiUrl('/api/users/block'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname }),
      })
      const body = await res.json()
      if (!res.ok) {
        alert(body.error || 'Unable to block user')
        return
      }
      await fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  async function unblockUser(nickname) {
    try {
      const res = await fetch(apiUrl('/api/users/unblock'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname }),
      })
      if (res.ok) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const outgoingIds = new Set(outgoing.map((r) => r.to_user_id))
  const blockedIds = new Set(blocked.map((b) => b.id))

  return (
    <div className="auth-panel friends-panel">
      <button className="close-button" onClick={onClose}>×</button>
      <h1>Draugi</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'friends' ? 'option-button selected' : 'option-button'} onClick={() => setTab('friends')}>Mani draugi</button>
        <button className={tab === 'find' ? 'option-button selected' : 'option-button'} onClick={() => setTab('find')}>Meklēt / Sūtīt</button>
        <button className={tab === 'incoming' ? 'option-button selected' : 'option-button'} onClick={() => setTab('incoming')}>Ienākošie</button>
        <button className={tab === 'outgoing' ? 'option-button selected' : 'option-button'} onClick={() => setTab('outgoing')}>Izejošie</button>
        <button className={tab === 'blocked' ? 'option-button selected' : 'option-button'} onClick={() => setTab('blocked')}>Bloķētie</button>
      </div>

        <div style={{ marginBottom: 12 }}>
        <input placeholder="Meklēt segvārdus..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ overflow: 'auto', minHeight: '52vh' }}>
        {tab === 'friends' && (
          <div>
            {friends.length === 0 ? (
              <div className="info">
                Šķiet, jums nav draugu. Vai vēlaties atrast dažus?
                <div style={{ marginTop: 8 }}>
                  <button className="option-button" onClick={() => setTab('find')}>Meklēt draugus</button>
                </div>
              </div>
            ) : (
              friends
                .filter((f) => f.nickname && f.nickname.toLowerCase().includes(search.toLowerCase()))
                .map((f) => (
                  <div key={f.id} className="user-card">
                    <div className="user-info">
                      <p>{f.nickname}</p>
                    </div>
                    <div>
                      <button className="option-button" onClick={() => blockUser(f.nickname)} style={{ backgroundColor: '#dc3545' }}>Bloķēt</button>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {tab === 'find' && (
          <div>
            {loading && <p className="info">Meklē...</p>}
            {!loading && results.length === 0 && <p className="info">Lietotāji nav atrasti.</p>}
            {results
              .filter((r) => r.nickname && r.role !== 'moderator')
              .map((r) => (
                <div key={r.id} className="user-card">
                  <div className="user-info">
                    <p>{r.nickname}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {outgoingIds.has(r.id) ? (
                      <button className="option-button" disabled>Pieprasīts</button>
                    ) : (
                      <button className="option-button" onClick={() => sendRequest(r.nickname)}>Sūtīt pieprasījumu</button>
                    )}
                    {blockedIds.has(r.id) ? (
                      <button className="option-button" disabled>Bloķēts</button>
                    ) : (
                      <button className="option-button" onClick={() => blockUser(r.nickname)} style={{ backgroundColor: '#dc3545' }}>Bloķēt</button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === 'incoming' && (
          <div>
            {incoming.length === 0 && <p className="info">Nav ienākošo pieprasījumu.</p>}
            {incoming.map((r) => (
              <div key={r.id} className="user-card">
                <div className="user-info">
                  <p>{r.nickname}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="option-button" onClick={() => acceptRequest(r.id)}>Pieņemt</button>
                  <button className="option-button" onClick={() => declineRequest(r.id)}>Noraidīt</button>
                  <button className="option-button" onClick={() => blockUser(r.nickname)} style={{ backgroundColor: '#dc3545' }}>Bloķēt</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'outgoing' && (
          <div>
            {outgoing.length === 0 && <p className="info">Nav izejošo pieprasījumu.</p>}
            {outgoing.map((r) => (
              <div key={r.id} className="user-card">
                <div className="user-info">
                  <p>{r.nickname}</p>
                </div>
                <div>
                  <button className="option-button" onClick={() => cancelRequest(r.id)}>Atcelt</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'blocked' && (
          <div>
            {blocked.length === 0 && <p className="info">Nav bloķētu lietotāju.</p>}
            {blocked.map((b) => (
              <div key={b.id} className="user-card">
                <div className="user-info">
                  <p>{b.nickname}</p>
                </div>
                <div>
                  <button className="option-button" onClick={() => unblockUser(b.nickname)}>Atbloķēt</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
