import { useState } from 'react'

const API_URL = 'http://localhost:4000'

const LoginForm = ({ onLogin, onSwitchMode, formState, setFormState }) => {
  // Use props if provided (for persistence), otherwise use local state
  const [localState, setLocalState] = useState({
    email: formState?.email || '',
    password: formState?.password || ''
  })

  // Sync with props when they change
  const state = formState ? { ...localState, ...formState } : localState
  const setState = (updates) => {
    const newState = typeof updates === 'function' ? updates(state) : updates
    setLocalState(newState)
    if (setFormState) {
      setFormState(newState)
    }
  }

  const { email, password } = state
  const setEmail = (val) => setState(prev => ({ ...prev, email: val }))
  const setPassword = (val) => setState(prev => ({ ...prev, password: val }))

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Login failed.')
        return
      }

      localStorage.setItem('authToken', body.token)
      onLogin(body.user)
      setMessage('Login successful!')
    } catch (err) {
      setError('Network error. Make sure the backend is running on http://localhost:4000')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimum 8 characters"
            minLength={8}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : 'Login'}
        </button>
      </form>

      <p className="switch-line">
        Need an account?
        <button className="link-button" type="button" onClick={onSwitchMode}>
          Register
        </button>
      </p>

      {message && <div className="info">{message}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

export default LoginForm
