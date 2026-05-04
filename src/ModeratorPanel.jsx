import { useState, useEffect } from 'react'

const API_URL = 'http://localhost:4000'

const ModeratorPanel = ({ onLogout }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  
  // Reģistrācijas formas stāvoklis
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)
  const passwordComplexityRegex = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?`~]).{8,}$/
  const [regPwValid, setRegPwValid] = useState(() => passwordComplexityRegex.test(registerPassword || ''))

  const token = localStorage.getItem('authToken')

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json()
      
      if (!response.ok) {
        setError(body.error || 'Neizdevās iegūt lietotājus')
        return
      }
      
      setUsers(body.users)
    } catch (err) {
      setError('Tīkla kļūda')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleDeleteUser = async (userId) => {
    if (!confirm('Vai tiešām vēlaties dzēst šo lietotāju? Tas arī dzēsīs viņu mājdzīvnieku.')) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Neizdevās dzēst lietotāju')
        return
      }

      // Atsvaidzināt lietotāju sarakstu
      fetchUsers()
    } catch (err) {
      setError('Tīkla kļūda')
    }
  }

  const handleRegisterModerator = async (e) => {
    e.preventDefault()
    setRegisterError('')
    setRegisterSuccess('')
    setRegisterLoading(true)

    if (!passwordComplexityRegex.test(registerPassword || '')) {
      setRegisterError('Parolei jābūt vismaz 8 rakstzīmēm, jāiekļauj viens cipars un viens speciāls simbols.')
      setRegisterLoading(false)
      return
    }

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
        setRegisterError(body.error || 'Neizdevās izveidot moderatoru')
        return
      }

      setRegisterSuccess(`Moderators izveidots: ${body.user.email}`)
      setRegisterEmail('')
      setRegisterPassword('')
      fetchUsers()
    } catch (err) {
      setRegisterError('Tīkla kļūda')
    } finally {
      setRegisterLoading(false)
    }
  }

  return (
    <div className="moderator-panel">
      <div className="moderator-header">
        <h1>Moderatora panelis</h1>
        <button className="logout-button" onClick={onLogout}>Izrakstīties</button>
      </div>

      <button 
        className="create-mod-button"
        onClick={() => setShowRegisterForm(!showRegisterForm)}
      >
        {showRegisterForm ? 'Atcelt' : 'Izveidot jaunu moderatoru'}
      </button>

      {showRegisterForm && (
        <form className="register-mod-form" onSubmit={handleRegisterModerator}>
          <h3>Reģistrēt jaunu moderatoru</h3>
          <label>
            E-pasts
            <input
              type="email"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              placeholder="moderator@piemers.lv"
              required
            />
          </label>
          <label>
            Parole
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => { const v = e.target.value; setRegisterPassword(v); setRegPwValid(passwordComplexityRegex.test(v || '')); setRegisterError('') }}
              placeholder="Vismaz 8 rakstzīmes, 1 cipars un 1 speciāls simbols"
              minLength={8}
              required
            />
            <p className="info">Parolei jābūt vismaz 8 rakstzīmēm un jāiekļauj vismaz viens cipars un viens speciāls simbols.</p>
          </label>
          <button type="submit" disabled={registerLoading || !regPwValid}>
            {registerLoading ? 'Izveido...' : 'Izveidot moderatoru'}
          </button>
          {registerError && <p className="error">{registerError}</p>}
          {registerSuccess && <p className="success">{registerSuccess}</p>}
        </form>
      )}

      <h2>Visi lietotāji</h2>
      
      {loading ? (
        <p>Ielādē...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <div className="user-list">
          {users.map((user) => (
            <div key={user.id} className="user-card">
              <div className="user-info">
                <p><strong>E-pasts:</strong> {user.email}</p>
                <p><strong>Segvārds:</strong> {user.nickname || 'N/A'}</p>
                <p><strong>Loma:</strong> <span className={`role-${user.role}`}>{user.role}</span></p>
                <p><strong>Izveidots:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
              </div>
              {user.role !== 'moderator' && (
                <button 
                  className="delete-button"
                  onClick={() => handleDeleteUser(user.id)}
                >
                  Dzēst lietotāju
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