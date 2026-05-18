import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState, useEffect } from 'react'
import './App.css'
import { OrbitControls, Text } from '@react-three/drei'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'
import PetCreationForm from './PetCreationForm'
import ModeratorPanel from './ModeratorPanel'
import FriendsPanel from './FriendsPanel'
import TasksPanel from './TasksPanel'
import InventoryPanel from './InventoryPanel'
import { getLevelProgress } from './level'
import PetModel from './models/PetModel'
import { apiUrl } from './api'

// Lokalizācijas atbalsta kartes (lietotāja redzamām vērtībām)
const appearanceLabels = { cube: 'Suns', pyramid: 'Kaķis', dog: 'Suns', cat: 'Kaķis' }
const colorLabels = { red: 'Sarkans', blue: 'Zils', green: 'Zaļš' }
const genderLabels = { male: 'Tēviņš', female: 'Mātīte', 'non-binary': 'Ne-binārs' }
const translateAppearance = (a) => appearanceLabels[a] || a
const translateColor = (c) => colorLabels[c] || c
const translateGender = (g) => genderLabels[g] || g

const TorusKnot = ({ position, size, color }) => {
  const ref = useRef()

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.x += delta * 0.5
    ref.current.rotation.y += delta * 0.5
    ref.current.position.y = Math.sin(state.clock.elapsedTime) * 0.5
  })

  return (
    <mesh position={position} ref={ref}>
      <torusKnotGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

const InteractiveCube = ({ position, color, label, onClick }) => {
  const ref = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * 0.3
    if (hovered) {
      ref.current.scale.setScalar(1.2)
    } else {
      ref.current.scale.setScalar(1)
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={hovered ? '#ffffff' : color} />
      </mesh>
      <Text
        position={[0, 1.2, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}

const Pet = ({ pet }) => {
  const ref = useRef()
  const [targetPos, setTargetPos] = useState([0, 0, 0])
  const [moveTimer, setMoveTimer] = useState(0)

  const colorMap = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e'
  }

  useFrame((state, delta) => {
    if (!ref.current || !pet) return

    // Pagriež mājdzīvnieku
    ref.current.rotation.y += delta * 0.5

    // Pārvietošanas taimeris - maina pozīciju ik pēc 3 sekundēm
    setMoveTimer((prev) => {
      const newTimer = prev + delta
      if (newTimer > 3) {
        // Izvēlas nejaušu pozīciju platformas robežās
        const x = (Math.random() - 0.5) * 8
        const z = (Math.random() - 0.5) * 4
        setTargetPos([x, 0, z])
        return 0
      }
      return newTimer
    })

    // Lēni pārvietojas uz mērķi
    const currentPos = ref.current.position
    currentPos.x += (targetPos[0] - currentPos.x) * delta * 0.5
    currentPos.z += (targetPos[2] - currentPos.z) * delta * 0.5
    // Šūpojas augšā un lejā
    currentPos.y = Math.sin(state.clock.elapsedTime * 2) * 0.1
  })

  if (!pet) return null

  const petColor = colorMap[pet.color] || '#ef4444'

  const appearanceType = pet.appearance === 'cube' ? 'dog' : pet.appearance === 'pyramid' ? 'cat' : pet.appearance

  return (
    <group ref={ref} position={[0, 0, 0]}>
      <PetModel type={appearanceType} color={petColor} scale={0.8} />
      <Text position={[0, 0.8, 0]} fontSize={0.25} color="white" anchorX="center" anchorY="middle">
        {pet.name}
      </Text>
    </group>
  )
}

const MainScene = ({ onLogout, pet, onOpenFeature }) => {
  const handleCubeClick = (feature) => {
    if (feature === 'logout') {
      onLogout()
      return
    }
    if (onOpenFeature) onOpenFeature(feature)
  }

  return (
    <>
      {/* Grīdas plakne */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2a3a" />
      </mesh>

      {/* Mājdzīvnieks */}
      <Pet pet={pet} />

      {/* Interaktīvie kubi */}
      <InteractiveCube
        position={[-3, 0, 0]}
        color="#4a9eff"
        label="Inventārs"
        onClick={() => handleCubeClick('inventory')}
      />
      <InteractiveCube
        position={[-1, 0, 0]}
        color="#ff9f4a"
        label="Uzdevumi"
        onClick={() => handleCubeClick('tasks')}
      />
      <InteractiveCube
        position={[1, 0, 0]}
        color="#4aff9f"
        label="Draugi"
        onClick={() => handleCubeClick('friends')}
      />
      <InteractiveCube
        position={[3, 0, 0]}
        color="#ff4a4a"
        label="Izrakstīties"
        onClick={() => handleCubeClick('logout')}
      />

      {/* Funkcijas indikators tiek apzināti apstrādāts App līmeņa UI (FriendsPanel) */}

      <OrbitControls enableZoom={true} />
    </>
  )
}

const App = () => {
  const [mode, setMode] = useState('register')
  const [user, setUser] = useState(null)
  const [activeFeature, setActiveFeature] = useState(null)
  const [showPanel, setShowPanel] = useState(true)
  const [pendingUser, setPendingUser] = useState(null) // { email, nickname }

  // Atjauno stāvokli no localStorage, ielādējot lapu
  useEffect(() => {
    const savedMode = localStorage.getItem('appMode')
    const savedShowPanel = localStorage.getItem('showPanel')
    const savedUser = localStorage.getItem('appUser')
    const savedPendingUser = localStorage.getItem('pendingUser')

    if (savedMode) setMode(savedMode)
    if (savedShowPanel !== null) setShowPanel(savedShowPanel === 'true')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (e) {
        console.error('Failed to parse saved user:', e)
      }
    }
    if (savedPendingUser) {
      try {
        setPendingUser(JSON.parse(savedPendingUser))
      } catch (e) {
        console.error('Failed to parse saved pendingUser:', e)
      }
    }
  }, [])

  // Saglabā stāvokli localStorage, kad tas mainās
  useEffect(() => {
    localStorage.setItem('appMode', mode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('showPanel', showPanel)
  }, [showPanel])

  useEffect(() => {
    if (user) {
      localStorage.setItem('appUser', JSON.stringify(user))
    } else {
      localStorage.removeItem('appUser')
    }
  }, [user])

  // Klausās, vai citas komponentes pieprasa lietotāja atsvaidzināšanu (piem., piešķirts mājdzīvnieka XP)
  useEffect(() => {
    const handleRefresh = async () => {
      const token = localStorage.getItem('authToken')
      if (!token) return
      try {
        const res = await fetch(apiUrl('/api/profile'), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
        const body = await res.json()
        if (res.ok) {
          setUser(body.user)
        } else {
          console.error('Failed to refresh user', body)
        }
      } catch (err) {
        console.error('Refresh user error:', err)
      }
    }

    window.addEventListener('refreshUser', handleRefresh)
    return () => window.removeEventListener('refreshUser', handleRefresh)
  }, [])

  // Automātiski inicializē noklusējuma uzdevumus, ja lietotājs ir (idempotenti)
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('authToken')
    if (!token) return
    ;(async () => {
      try {
        await fetch(apiUrl('/api/tasks/seed'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      } catch (e) {
        // Ignorēt kļūdu
      }
    })()
  }, [user])

  useEffect(() => {
    if (pendingUser) {
      localStorage.setItem('pendingUser', JSON.stringify(pendingUser))
    } else {
      localStorage.removeItem('pendingUser')
    }
  }, [pendingUser])

  // Saglabā reģistrācijas formas stāvokli
  const [registerFormState, setRegisterFormState] = useState({
    email: '',
    password: '',
    nickname: '',
    step: 'register'
  })

  // Saglabā pieteikšanās formas stāvokli
  const [loginFormState, setLoginFormState] = useState({
    email: '',
    password: ''
  })

  useEffect(() => {
    const saved = localStorage.getItem('registerFormState')
    if (saved) {
      try {
        setRegisterFormState(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse registerFormState:', e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('registerFormState', JSON.stringify(registerFormState))
  }, [registerFormState])

  useEffect(() => {
    const saved = localStorage.getItem('loginFormState')
    if (saved) {
      try {
        setLoginFormState(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse loginFormState:', e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('loginFormState', JSON.stringify(loginFormState))
  }, [loginFormState])

  // Saglabā mājdzīvnieka izveides formas stāvokli
  const [petCreationFormState, setPetCreationFormState] = useState({
    name: '',
    appearance: '',
    color: '',
    gender: ''
  })

  useEffect(() => {
    const saved = localStorage.getItem('petCreationFormState')
    if (saved) {
      try {
        setPetCreationFormState(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse petCreationFormState:', e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('petCreationFormState', JSON.stringify(petCreationFormState))
  }, [petCreationFormState])

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setUser(null)
    setMode('login')
    setShowPanel(true)
    // Notīra formu stāvokļus izrakstoties
    setRegisterFormState({ email: '', password: '', nickname: '', step: 'register' })
    setLoginFormState({ email: '', password: '' })
    setPetCreationFormState({ name: '', appearance: '', color: '', gender: '' })
  }

  const handleNicknameSet = (email, nickname, password) => {
    setPendingUser({ email, nickname, password })
    setMode('pet-creation')
  }

  const handlePetCreated = async (pet) => {
    setPendingUser(null)
    // Automātiska pieteikšanās pēc mājdzīvnieka izveides
    try {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, password: pendingUser.password }),
      })
      const body = await response.json()
      if (response.ok) {
        localStorage.setItem('authToken', body.token)
        setUser(body.user)
        setMode('main')
      }
    } catch (err) {
      console.error('Auto-login failed:', err)
      setMode('login')
    }
  }

  const handlePetSkip = () => {
    setPendingUser(null)
    setMode('login')
  }

  // Aprēķina mājdzīvnieka līmeni/progresu attēlošanai (izmanto kopējo XP)
  const petProgress = user?.pet ? getLevelProgress(user.pet.xp ?? 0) : null

  return (
    <div className="app-shell">
      {user?.role === 'moderator' ? (
        <ModeratorPanel onLogout={handleLogout} />
      ) : (
        <Canvas>
          <Scene user={user} onLogout={handleLogout} showBackground={mode !== 'pet-creation'} onOpenFeature={(f) => setActiveFeature(f)} />
        </Canvas>
      )}

      {activeFeature === 'friends' && user && (
        <FriendsPanel onClose={() => setActiveFeature(null)} />
      )}

      {activeFeature === 'tasks' && user && (
        <TasksPanel onClose={() => setActiveFeature(null)} />
      )}

      {activeFeature === 'inventory' && user && (
        <InventoryPanel onClose={() => setActiveFeature(null)} />
      )}

      {showPanel && user && (
        <div className="auth-panel">
          <button className="close-button" onClick={() => setShowPanel(false)}>×</button>
          <h1>Laipni lūdzam atpakaļ</h1>
          {user.nickname && <p className="info">Segvārds: {user.nickname}</p>}
          {user.pet && (
            <p className="info">
              Mājdzīvnieks: {user.pet.name} ({translateAppearance(user.pet.appearance)}, {translateColor(user.pet.color)}, {translateGender(user.pet.gender)})
            </p>
          )}
          {user.pet && petProgress && (
            <p className="info">Līmenis: {petProgress.level} — XP: {petProgress.xpIntoLevel}/{petProgress.xpForNextLevel}</p>
          )}
          <p className="info">Pieslēdzies kā {user.email}</p>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Izrakstīties
          </button>
        </div>
      )}

      {!showPanel && user && (
        <button className="open-panel-button" onClick={() => setShowPanel(true)}>☰</button>
      )}

      {!user && (
        <div className="auth-panel pet-creation-wrapper">
          {mode === 'pet-creation' && pendingUser ? (
            <PetCreationForm
              email={pendingUser.email}
              password={pendingUser.password}
              nickname={pendingUser.nickname}
              onPetCreated={handlePetCreated}
              formState={petCreationFormState}
              setFormState={setPetCreationFormState}
            />
          ) : mode === 'register' ? (
            <RegisterForm 
              onRegisterSuccess={() => setMode('login')} 
              onSwitchMode={() => setMode('login')} 
              onNicknameSet={handleNicknameSet}
              formState={registerFormState}
              setFormState={setRegisterFormState}
            />
          ) : (
            <LoginForm 
              onLogin={setUser} 
              onSwitchMode={() => setMode('register')}
              formState={loginFormState}
              setFormState={setLoginFormState}
            />
          )}
        </div>
      )}
    </div>
  )
}

const Scene = ({ user, onLogout, showBackground = true, onOpenFeature }) => {
  return (
    <>
      <directionalLight intensity={0.8} position={[2, 3, 2]} />
      <ambientLight intensity={0.2} />
      {user ? (
        <MainScene onLogout={onLogout} pet={user.pet} onOpenFeature={onOpenFeature} />
      ) : showBackground ? (
        <TorusKnot position={[0, 0, 0]} size={[1, 0.4, 100, 16]} color="Lime" />
      ) : null}
      <OrbitControls enableZoom={true} />
    </>
  )
}

export default App
