import { useState, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'

const API_URL = 'http://localhost:4000'

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

  return (
    <group ref={ref}>
      {appearance === 'cube' ? (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={petColor} />
        </mesh>
      ) : appearance === 'pyramid' ? (
        <mesh>
          <coneGeometry args={[0.6, 1.2, 4]} />
          <meshStandardMaterial color={petColor} />
        </mesh>
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
  // Use props if provided (for persistence), otherwise use local state
  const [localState, setLocalState] = useState({
    name: formState?.name || '',
    appearance: formState?.appearance || '',
    color: formState?.color || '',
    gender: formState?.gender || ''
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
      setError('Please enter a pet name.')
      return
    }

    if (!appearance || !color || !gender) {
      setError('Please select all options.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/create-pet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname, name, appearance, color, gender }),
      })

      const body = await response.json()

      if (!response.ok) {
        setError(body.error || 'Failed to create pet.')
        return
      }

      onPetCreated(body.pet)
    } catch (err) {
      setError('Network error. Make sure the backend is running.')
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
        <h1>Create Your Pet</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <label>Pet Name (max 8 letters)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 8))}
              placeholder="Enter name"
              maxLength={8}
              required
            />
          </div>

          <div className="form-section">
            <label>Appearance</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button ${appearance === 'cube' ? 'selected' : ''}`}
                onClick={() => setAppearance('cube')}
              >
                Cube
              </button>
              <button
                type="button"
                className={`option-button ${appearance === 'pyramid' ? 'selected' : ''}`}
                onClick={() => setAppearance('pyramid')}
              >
                Pyramid
              </button>
            </div>
          </div>

          <div className="form-section">
            <label>Color</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button color-btn ${color === 'red' ? 'selected' : ''}`}
                onClick={() => setColor('red')}
                style={{ background: color === 'red' ? '#ef4444' : '#7f1d1d' }}
              >
                Red
              </button>
              <button
                type="button"
                className={`option-button color-btn ${color === 'blue' ? 'selected' : ''}`}
                onClick={() => setColor('blue')}
                style={{ background: color === 'blue' ? '#3b82f6' : '#1e3a5f' }}
              >
                Blue
              </button>
              <button
                type="button"
                className={`option-button color-btn ${color === 'green' ? 'selected' : ''}`}
                onClick={() => setColor('green')}
                style={{ background: color === 'green' ? '#22c55e' : '#14532d' }}
              >
                Green
              </button>
            </div>
          </div>

          <div className="form-section">
            <label>Gender</label>
            <div className="option-group">
              <button
                type="button"
                className={`option-button ${gender === 'female' ? 'selected' : ''}`}
                onClick={() => setGender('female')}
              >
                Female
              </button>
              <button
                type="button"
                className={`option-button ${gender === 'male' ? 'selected' : ''}`}
                onClick={() => setGender('male')}
              >
                Male
              </button>
              <button
                type="button"
                className={`option-button ${gender === 'non-binary' ? 'selected' : ''}`}
                onClick={() => setGender('non-binary')}
              >
                Non-binary
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || !name || !appearance || !color || !gender}>
            {loading ? 'Creating...' : 'Create Pet'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export default PetCreationForm