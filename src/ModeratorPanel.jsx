import { useState, useEffect } from 'react'

const API_URL = 'http://localhost:4000'

const ModeratorPanel = ({ onLogout }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  
  // Register form state
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)

  const token = localStorage.getItem('authToken')

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json()
      
      if (!response.ok) {
        setError(body.error || 'Failed to fetch users')
        return
      }
      
      setUsers(body.users)
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? This will also delete their pet.')) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Failed to delete user')
        return
      }

      // Refresh user list
      fetchUsers()
    } catch (err) {
      setError('Network error')
    }
  }

  const handleRegisterModerator = async (e) => {
    e.preventDefault()
    setRegisterError('')
    setRegisterSuccess('')
    setRegisterLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/create-moderator`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: registerEmail, password: registerPassword })
      })
      const body = await response.json()

      if (!response.ok) {
        setRegisterError(body.error || 'Failed to create moderator')
        return
      }

      setRegisterSuccess(`Moderator created: ${body.user.email}`)
      setRegisterEmail('')
      setRegisterPassword('')
      fetchUsers()
    } catch (err) {
      setRegisterError('Network error')
    } finally {
      setRegisterLoading(false)
    }
  }

  return (
    <div className="moderator-panel">
      <div className="moderator-header">
        <h1>Moderator Dashboard</h1>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>

      <button 
        className="create-mod-button"
        onClick={() => setShowRegisterForm(!showRegisterForm)}
      >
        {showRegisterForm ? 'Cancel' : 'Create New Moderator'}
      </button>

      {showRegisterForm && (
        <form className="register-mod-form" onSubmit={handleRegisterModerator}>
          <h3>Register New Moderator</h3>
          <label>
            Email
            <input
              type="email"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              placeholder="moderator@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </label>
          <button type="submit" disabled={registerLoading}>
            {registerLoading ? 'Creating...' : 'Create Moderator'}
          </button>
          {registerError && <p className="error">{registerError}</p>}
          {registerSuccess && <p className="success">{registerSuccess}</p>}
        </form>
      )}

      <h2>All Users</h2>
      
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <div className="user-list">
          {users.map((user) => (
            <div key={user.id} className="user-card">
              <div className="user-info">
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Nickname:</strong> {user.nickname || 'N/A'}</p>
                <p><strong>Role:</strong> <span className={`role-${user.role}`}>{user.role}</span></p>
                <p><strong>Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
              </div>
              {user.role !== 'moderator' && (
                <button 
                  className="delete-button"
                  onClick={() => handleDeleteUser(user.id)}
                >
                  Delete User
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ModeratorPanel