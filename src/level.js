export function xpForNextLevel(level = 1) {
  const lvl = Math.max(1, Number(level) || 1)
  return 100 + (lvl - 1) * 5
}

export function getLevelProgress(totalXp = 0) {
  let remaining = Math.max(0, Math.floor(Number(totalXp) || 0))
  let level = 1
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level)
    level += 1
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: xpForNextLevel(level),
  }
}

export default { xpForNextLevel, getLevelProgress }
