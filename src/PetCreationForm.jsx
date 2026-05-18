import { useState, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import PetModel from './models/PetModel'
import { apiUrl } from './api'

const PetPreview = ({ appearance, color, name }) => {
  const ref = useRef()
  const colorMap = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e'
  }

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5
    }
  })

  const petColor = colorMap[color] || '#ef4444'
  const appearanceType = appearance === 'cube' ? 'dog' : appearance === 'pyramid' ? 'cat' : appearance

  return (
    <group ref={ref}>
      {appearanceType ? (
        <PetModel type={appearanceType} color={petColor} scale={1} />
      ) : null}
      {name && (
        <Text position={[0, 1, 0]} fontSize={0.3} color="white" anchorX="center" anchorY="middle">
          {name}
        </Text>
      )}
    </group>
  )
}

const PetCreationForm = ({ email, password, nickname, onPetCreated, formState, setFormState }) => {
  // Izmanto props, ja pieejami (saglabāšanai), citādi lokālu stāvokli
  const [localState, setLocalState] = useState({
    name: formState?.name || '',
    appearance: formState?.appearance || '',
    color: formState?.color || '',
    gender: formState?.gender || ''
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

  const { name, appearance, color, gender } = state
  const setName = (val) => setState(prev => ({ ...prev, name: val }))
  const setAppearance = (val) => setState(prev => ({ ...prev, appearance: val }))
  const setColor = (val) => setState(prev => ({ ...prev, color: val }))
  const setGender = (val) => setState(prev => ({ ...prev, gender: val }))

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!name || name.trim().length === 0) {
      setError('Lūdzu, ievadiet mājdzīvnieka vārdu.')
      return
    }

    if (!appearance || !color || !gender) {
      setError('Lūdzu, izvēlieties visas opcijas.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiUrl('/api/create-pet'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname, name, appearance, color, gender }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Neizdevās izveidot mājdzīvnieku.')
        return
      }

      onPetCreated(body.pet)
    } catch (err) {
      setError('Tīkla kļūda. Pārliecinieties, ka backend darbojas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pet-creation-container">
      <div className="pet-preview-panel">
        <Canvas>
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 2]} intensity={0.8} />
          <PetPreview appearance={appearance} color={color} name={name} />
          <OrbitControls enableZoom={false} />
        </Canvas>
      </div>

      <div className="pet-creation">
        <h1>Izveido savu mājdzīvnieku</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <label>Mājdzīvnieka vārds (maks. 8 burti)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 8))}
              placeholder="Ievadiet vārdu"
              maxLength={8}
              required
            />
          </div>

          <div className="form-section">
            <label>Izskats</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button ${appearance === 'dog' || appearance === 'cube' ? 'selected' : ''}`}
                onClick={() => setAppearance('dog')}
              >
                Suns
              </button>
              <button
                type="button"
                className={`option-button ${appearance === 'cat' || appearance === 'pyramid' ? 'selected' : ''}`}
                onClick={() => setAppearance('cat')}
              >
                Kaķis
              </button>
            </div>
          </div>

          <div className="form-section">
            <label>Krāsa</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button color-btn ${color === 'red' ? 'selected' : ''}`}
                onClick={() => setColor('red')}
                style={{ background: color === 'red' ? '#ef4444' : '#7f1d1d' }}
              >
                Sarkans
              </button>
              <button
                type="button"
                className={`option-button color-btn ${color === 'blue' ? 'selected' : ''}`}
                onClick={() => setColor('blue')}
                style={{ background: color === 'blue' ? '#3b82f6' : '#1e3a5f' }}
              >
                Zils
              </button>
              <button
                type="button"
                className={`option-button color-btn ${color === 'green' ? 'selected' : ''}`}
                onClick={() => setColor('green')}
                style={{ background: color === 'green' ? '#22c55e' : '#14532d' }}
              >
                Zaļš
              </button>
            </div>
          </div>

          <div className="form-section">
            <label>Dzimums</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button ${gender === 'female' ? 'selected' : ''}`}
                onClick={() => setGender('female')}
              >
                Mātīte
              </button>
              <button
                type="button"
                className={`option-button ${gender === 'male' ? 'selected' : ''}`}
                onClick={() => setGender('male')}
              >
                Tēviņš
              </button>
              <button
                type="button"
                className={`option-button ${gender === 'non-binary' ? 'selected' : ''}`}
                onClick={() => setGender('non-binary')}
              >
                Ne-binārs
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || !name || !appearance || !color || !gender}>
            {loading ? 'Izveido...' : 'Izveidot mājdzīvnieku'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export default PetCreationForm