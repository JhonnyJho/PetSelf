import { useState } from 'react'

const API_URL = 'http://localhost:4000'

const RegisterForm = ({ onRegisterSuccess, onSwitchMode }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Registration failed.')
        return
      }

      setMessage('Registration complete. Please log in.')
      onRegisterSuccess()
      setPassword('')
    } catch (err) {
      setError('Network error. Make sure the backend is running on http://localhost:4000')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Register</h1>
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
          {loading ? 'Processing...' : 'Register'}
        </button>
      </form>

      <p className="switch-line">
        Already have an account?
        <button className="link-button" type="button" onClick={onSwitchMode}>
          Login
        </button>
      </p>

      {message && <div className="info">{message}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

export default RegisterForm
