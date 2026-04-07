import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import './App.css'
import { OrbitControls } from '@react-three/drei'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'

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

const App = () => {
  const [mode, setMode] = useState('register')
  const [user, setUser] = useState(null)

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setUser(null)
    setMode('login')
  }

  return (
    <div className="app-shell">
      <Canvas>
        <Scene />
      </Canvas>

      <div className="auth-panel">
        {user ? (
          <>
            <h1>Welcome back</h1>
            <p className="info">Logged in as {user.email}</p>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : mode === 'register' ? (
          <RegisterForm onRegisterSuccess={() => setMode('login')} onSwitchMode={() => setMode('login')} />
        ) : (
          <LoginForm onLogin={setUser} onSwitchMode={() => setMode('register')} />
        )}
      </div>
    </div>
  )
}

const Scene = () => {
  return (
    <>
      <directionalLight intensity={0.8} position={[2, 3, 2]} />
      <ambientLight intensity={0.2} />
      <TorusKnot position={[0, 0, 0]} size={[1, 0.4, 100, 16]} color="Lime" />
      <OrbitControls enableZoom={true} />
    </>
  )
}

export default App
