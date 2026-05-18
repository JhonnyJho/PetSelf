import { useState } from 'react'
import { apiUrl } from './api'

const LoginForm = ({ onLogin, onSwitchMode, formState, setFormState }) => {
  // Izmanto props, ja pieejami (saglabāšanai), citādi lokālu stāvokli
  const [localState, setLocalState] = useState({
    email: formState?.email || '',
    password: formState?.password || ''
  })

  // Sinhronizē ar props, ja tie mainās
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
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Pieteikšanās neizdevās.')
        return
      }

      localStorage.setItem('authToken', body.token)
      onLogin(body.user)
      setMessage('Pieteikšanās veiksmīga!')
    } catch (err) {
      setError('Tīkla kļūda. Pārliecinieties, ka backend ir sasniedzams.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Pieteikties</h1>
      <form onSubmit={handleSubmit}>
        <label>
          E-pasts
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jūsu@piemers.lv"
            required
          />
        </label>

        <label>
          Parole
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Vismaz 8 rakstzīmes"
            minLength={8}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Apstrādā...' : 'Pieteikties'}
        </button>
      </form>

      <p className="switch-line">
        Nav konta?
        <button className="link-button" type="button" onClick={onSwitchMode}>
          Reģistrēties
        </button>
      </p>

      {message && <div className="info">{message}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

export default LoginForm
