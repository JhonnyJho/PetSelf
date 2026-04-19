import { useState } from 'react'

const API_URL = 'http://localhost:4000'

const RegisterForm = ({ onRegisterSuccess, onSwitchMode, onNicknameSet, formState, setFormState }) => {
  // Use props if provided (for persistence), otherwise use local state
  const [localState, setLocalState] = useState({
    email: formState?.email || '',
    password: formState?.password || '',
    nickname: formState?.nickname || '',
    step: formState?.step || 'register'
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

  const { email, password, nickname, step } = state
  const setEmail = (val) => setState(prev => ({ ...prev, email: val }))
  const setPassword = (val) => setState(prev => ({ ...prev, password: val }))
  const setNickname = (val) => setState(prev => ({ ...prev, nickname: val }))
  const setStep = (val) => setState(prev => ({ ...prev, step: val }))

  const [existingUser, setExistingUser] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      // Check if email already exists
      const res = await fetch(`${API_URL}/api/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Unable to check email')
        setLoading(false)
        return
      }

      if (body.exists) {
        setError('An account with this email already exists. Please log in.')
        setLoading(false)
        return
      }

      // Email is available — proceed to nickname step
      setStep('nickname')
    } catch (err) {
      setError('Network error. Make sure the backend is running on http://localhost:4000')
    } finally {
      setLoading(false)
    }
  }

  const handleNicknameSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/check-nickname`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Failed to check nickname.')
        return
      }

      if (body.exists) {
        setExistingUser(body.user)
        setStep('login-prompt')
      } else {
        // Set the nickname
        const setResponse = await fetch(`${API_URL}/api/set-nickname`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, nickname }),
        })

        const setBody = await setResponse.json()

        if (!setResponse.ok) {
          setError(setBody.error || 'Failed to set nickname.')
          return
        }

        setMessage('Nickname set!')
        onNicknameSet(email, nickname, password)
        setPassword('')
      }
    } catch (err) {
      setError('Network error. Make sure the backend is running on http://localhost:4000')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginInstead = () => {
    setStep('register')
    onSwitchMode()
  }

  if (step === 'nickname') {
    return (
      <>
        <h1>Choose Nickname</h1>
        <p className="info">Nickname must be 4-7 characters.</p>
        <form onSubmit={handleNicknameSubmit}>
          <label>
            Nickname
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Enter 4-7 letters"
              minLength={4}
              maxLength={7}
              required
            />
          </label>

          <button type="submit" disabled={loading || nickname.length < 4 || nickname.length > 7}>
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </>
    )
  }

  if (step === 'login-prompt') {
    return (
      <>
        <h1>Nickname Taken</h1>
        <p className="info">This nickname is already taken by {existingUser?.email}</p>
        <p>Would you like to log in instead?</p>
        <button type="button" onClick={handleLoginInstead} style={{ width: '100%', marginTop: '12px' }}>
          Login with {existingUser?.email}
        </button>
        <button
          type="button"
          onClick={() => { setStep('nickname'); setNickname(''); setError(''); }}
          style={{ width: '100%', marginTop: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
        >
          Choose Different Nickname
        </button>
      </>
    )
  }

  return (
    <>
      <h1>Register</h1>
      <form onSubmit={handleRegister}>
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
