import { useState, useEffect } from 'react'

export default function FriendsPanel({ onClose }) {
  const [tab, setTab] = useState('friends')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
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
    await Promise.all([fetchFriends(), fetchIncoming(), fetchOutgoing()])
  }

  async function fetchFriends() {
    try {
      const res = await fetch('http://localhost:4000/api/friends', { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setFriends(body.friends || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchIncoming() {
    try {
      const res = await fetch('http://localhost:4000/api/friends/requests/incoming', { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setIncoming(body.requests || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchOutgoing() {
    try {
      const res = await fetch('http://localhost:4000/api/friends/requests/outgoing', { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      setOutgoing(body.requests || [])
    } catch (err) {
      console.error(err)
    }
  }

  async function doSearch(q) {
    setLoading(true)
    try {
      let url = 'http://localhost:4000/api/users/search'
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
      const res = await fetch('http://localhost:4000/api/friends/request', {
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
      const res = await fetch(`http://localhost:4000/api/friends/requests/${id}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function declineRequest(id) {
    try {
      const res = await fetch(`http://localhost:4000/api/friends/requests/${id}/decline`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        await fetchAll()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function cancelRequest(id) {
    try {
      const res = await fetch(`http://localhost:4000/api/friends/requests/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) await fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  const outgoingIds = new Set(outgoing.map((r) => r.to_user_id))

  return (
    <div className="auth-panel friends-panel">
      <button className="close-button" onClick={onClose}>×</button>
      <h1>Friends</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'friends' ? 'option-button selected' : 'option-button'} onClick={() => setTab('friends')}>My Friends</button>
        <button className={tab === 'find' ? 'option-button selected' : 'option-button'} onClick={() => setTab('find')}>Find / Send</button>
        <button className={tab === 'incoming' ? 'option-button selected' : 'option-button'} onClick={() => setTab('incoming')}>Incoming</button>
        <button className={tab === 'outgoing' ? 'option-button selected' : 'option-button'} onClick={() => setTab('outgoing')}>Outgoing</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Search nicknames..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
        {tab === 'friends' && (
          <div>
            {friends.length === 0 ? (
              <div className="info">
                It seems you don't have friends. Would you like to find some?
                <div style={{ marginTop: 8 }}>
                  <button className="option-button" onClick={() => setTab('find')}>Find Friends</button>
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
                  </div>
                ))
            )}
          </div>
        )}

        {tab === 'find' && (
          <div>
            {loading && <p className="info">Searching...</p>}
            {!loading && results.length === 0 && <p className="info">No users found.</p>}
            {results
              .filter((r) => r.nickname && r.role !== 'moderator')
              .map((r) => (
                <div key={r.id} className="user-card">
                  <div className="user-info">
                    <p>{r.nickname}</p>
                  </div>
                  <div>
                    {outgoingIds.has(r.id) ? (
                      <button className="option-button" disabled>Requested</button>
                    ) : (
                      <button className="option-button" onClick={() => sendRequest(r.nickname)}>Send Request</button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === 'incoming' && (
          <div>
            {incoming.length === 0 && <p className="info">No incoming requests.</p>}
            {incoming.map((r) => (
              <div key={r.id} className="user-card">
                <div className="user-info">
                  <p>{r.nickname}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="option-button" onClick={() => acceptRequest(r.id)}>Accept</button>
                  <button className="option-button" onClick={() => declineRequest(r.id)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'outgoing' && (
          <div>
            {outgoing.length === 0 && <p className="info">No outgoing requests.</p>}
            {outgoing.map((r) => (
              <div key={r.id} className="user-card">
                <div className="user-info">
                  <p>{r.nickname}</p>
                </div>
                <div>
                  <button className="option-button" onClick={() => cancelRequest(r.id)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
