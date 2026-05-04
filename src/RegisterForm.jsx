import { useState, useRef, useEffect } from 'react'

const API_URL = 'http://localhost:4000'

const RegisterForm = ({ onRegisterSuccess, onSwitchMode, onNicknameSet, formState, setFormState }) => {
  // Izmanto props, ja pieejami (saglabāšanai), citādi lokālu stāvokli
  const [localState, setLocalState] = useState({
    email: formState?.email || '',
    password: formState?.password || '',
    nickname: formState?.nickname || '',
    step: formState?.step || 'register'
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

  const { email, password, nickname, step } = state
  const passwordComplexityRegex = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?`~]).{8,}$/
  const [pwValid, setPwValid] = useState(() => passwordComplexityRegex.test(password || ''))
  const setEmail = (val) => setState(prev => ({ ...prev, email: val }))
  const setPassword = (val) => { setState(prev => ({ ...prev, password: val })); setPwValid(passwordComplexityRegex.test(val || '')) }
  const setNickname = (val) => setState(prev => ({ ...prev, nickname: val }))
  const setStep = (val) => setState(prev => ({ ...prev, step: val }))

  const [existingUser, setExistingUser] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nicknameRef = useRef(null)

  useEffect(() => {
    if (step === 'nickname') {
      setTimeout(() => nicknameRef.current?.focus(), 60)
    }
  }, [step])

  const handleRegister = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    // Client-side password complexity check before proceeding
    if (!passwordComplexityRegex.test(password || '')) {
      setError('Parolei jābūt vismaz 8 rakstzīmēm, jāiekļauj viens cipars un viens speciāls simbols.')
      setLoading(false)
      return
    }

    try {
      // Pārbauda, vai e-pasts jau eksistē
      const res = await fetch(`${API_URL}/api/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Nevar pārbaudīt e-pastu')
        setLoading(false)
        return
      }

      if (body.exists) {
        setError('Konts ar šo e-pastu jau pastāv. Lūdzu, piesakieties.')
        setLoading(false)
        return
      }

      // E-pasts pieejams — pāriet uz segvārda soli
      setStep('nickname')
    } catch (err) {
      setError('Tīkla kļūda. Pārliecinieties, ka backend darbojas vietnē http://localhost:4000')
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
          setError(body.error || 'Neizdevās pārbaudīt segvārdu.')
        return
      }

      if (body.exists) {
        setExistingUser(body.user)
        setStep('login-prompt')
      } else {
        // Iestata segvārdu
        const setResponse = await fetch(`${API_URL}/api/set-nickname`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, nickname }),
        })

        const setBody = await setResponse.json()

        if (!setResponse.ok) {
          setError(setBody.error || 'Neizdevās iestatīt segvārdu.')
          return
        }

        setMessage('Segvārds iestatīts!')
        onNicknameSet(email, nickname, password)
        setPassword('')
      }
    } catch (err) {
      setError('Tīkla kļūda. Pārliecinieties, ka backend darbojas vietnē http://localhost:4000')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginInstead = () => {
    setStep('register')
    onSwitchMode()
  }

  const handleChooseOtherNickname = () => {
    const base = formState ? { ...localState, ...formState } : localState
    const newState = { ...base, step: 'nickname', nickname: '' }
    setLocalState(newState)
    if (setFormState) setFormState(newState)
    setError('')
    console.log('RegisterForm: switched to nickname step')
  }

  if (step === 'nickname') {
    return (
      <>
        <h1>Izvēlieties segvārdu</h1>
        <p className="info">Segvārdam jābūt 4–7 rakstzīmēm.</p>
        <form onSubmit={handleNicknameSubmit}>
          <label>
            Segvārds
              <input
                ref={nicknameRef}
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Ievadiet 4–7 burtus"
                minLength={4}
                maxLength={7}
                required
              />
          </label>

          <button type="submit" disabled={loading || nickname.length < 4 || nickname.length > 7}>
            {loading ? 'Pārbauda...' : 'Turpināt'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </>
    )
  }

  if (step === 'login-prompt') {
    return (
      <>
        <h1>Segvārds aizņemts</h1>
        <p className="info">Šo segvārdu jau izmanto {existingUser?.email}</p>
        <p>Vai vēlaties pieteikties tā vietā?</p>
        <button type="button" onClick={handleLoginInstead} className="primary-full">
          Pieteikties ar {existingUser?.email}
        </button>
        <button
          type="button"
          onClick={handleChooseOtherNickname}
          className="skip-button"
        >
          Izvēlēties citu segvārdu
        </button>
      </>
    )
  }

  return (
    <>
      <h1>Reģistrēties</h1>
      <form onSubmit={handleRegister}>
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
            placeholder="Vismaz 8 rakstzīmes, 1 cipars un 1 speciāls simbols"
            minLength={8}
            required
          />
          <p className="info">Parolei jābūt vismaz 8 rakstzīmēm un jāiekļauj vismaz viens cipars un viens speciāls simbols.</p>
        </label>

        <button type="submit" disabled={loading || !pwValid}>
          {loading ? 'Apstrādā...' : 'Reģistrēties'}
        </button>
      </form>

      <p className="switch-line">
        Jau ir konts?
        <button className="link-button" type="button" onClick={onSwitchMode}>
          Pieteikties
        </button>
      </p>

      {message && <div className="info">{message}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

export default RegisterForm
