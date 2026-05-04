import React from 'react'

// Viegls mājdzīvnieka atveidotājs priekš react-three-fiber.
// Attēlo kubu priekš `dog` un trīsstūrveida piramīdu priekš `cat`.
export default function PetModel({ type = 'dog', color, scale = 1, ...props }) {
  const c = color || '#ef4444'

  if (type === 'dog') {
    return (
      <group {...props} scale={scale}>
        <mesh>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshStandardMaterial color={c} />
        </mesh>
      </group>
    )
  }

  if (type === 'cat') {
    return (
      <group {...props} scale={scale}>
        <mesh rotation={[0, 0, 0]}>
          <coneGeometry args={[0.75, 1.2, 3]} />
          <meshStandardMaterial color={c} />
        </mesh>
      </group>
    )
  }

  // Noklusējuma rezerves variants
  return (
    <group {...props} scale={scale}>
      <mesh>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color={c} />
      </mesh>
    </group>
  )
}
