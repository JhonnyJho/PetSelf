import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = 'http://localhost:4000'

export default function InventoryPanel({ onClose }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [usingItemId, setUsingItemId] = useState(null)
  const [page, setPage] = useState(0)
  const [rarityFilter, setRarityFilter] = useState('all')

  const columns = 4
  const rows = 3
  const pageSize = columns * rows

  const token = localStorage.getItem('authToken')

  const fetchItems = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/inventory`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      const body = await res.json()
      if (res.ok) {
        setItems(body.items || [])
      }
    } catch (e) {
      console.error('Fetch inventory error', e)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const removeItem = async (id) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/inventory/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      if (res.ok) fetchItems()
    } catch (e) { console.error('Remove item error', e) }
  }

  const useItem = async (id) => {
    if (!token) return
    setUsingItemId(id)
    try {
      const res = await fetch(`${API_BASE}/api/inventory/use/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      const body = await res.json()
      if (res.ok) {
        if (body.petXp != null || body.levelUp) {
          window.dispatchEvent(new Event('refreshUser'))
        }

        if (body.effect) {
          window.dispatchEvent(new CustomEvent('inventoryEffect', { detail: body.effect }))
        }

        fetchItems()
      } else {
        alert(body.error || 'Failed to use item')
      }
    } catch (e) { console.error('Use item error', e) } finally { setUsingItemId(null) }
  }

  const filtered = items.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    const rarity = (i.rarity || 'common')
    if (rarityFilter !== 'all' && rarity !== rarityFilter) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { if (page >= totalPages) setPage(Math.max(0, totalPages - 1)) }, [totalPages])
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="tasks-modal-backdrop" onClick={onClose}>
      <div className="inventory-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Inventory</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="inventory-controls">
          <input placeholder="Search items" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
          <div className="rarity-filters">
            <button className={`filter-btn ${rarityFilter === 'all' ? 'selected' : ''}`} onClick={() => { setRarityFilter('all'); setPage(0) }}>All</button>
            <button className={`filter-btn ${rarityFilter === 'common' ? 'selected' : ''}`} onClick={() => { setRarityFilter('common'); setPage(0) }}>Common</button>
            <button className={`filter-btn ${rarityFilter === 'uncommon' ? 'selected' : ''}`} onClick={() => { setRarityFilter('uncommon'); setPage(0) }}>Uncommon</button>
            <button className={`filter-btn ${rarityFilter === 'rare' ? 'selected' : ''}`} onClick={() => { setRarityFilter('rare'); setPage(0) }}>Rare</button>
          </div>
        </div>

        <div className="inventory-grid">
          {pageItems.map((it) => (
            <div
              className="inventory-item"
              key={it.id}
              title={it.payload?.description || (it.subtype === 'xp' ? `Grants ${it.payload?.amount || 0} XP` : it.name)}
            >
              <div className={`item-swatch ${it.rarity || 'common'}`} />
              <div className="item-name">{it.name}</div>
              <div className="item-meta">{it.type} • {it.rarity || it.subtype}</div>
              {it.type === 'consumable' && !it.consumed && (
                <button
                  className="use-btn"
                  onClick={() => useItem(it.id)}
                  disabled={usingItemId === it.id}
                >
                  {usingItemId === it.id ? 'Using...' : (it.subtype === 'xp' ? `Use +${it.payload?.amount || ''}` : 'Use')}
                </button>
              )}
              <button className="remove-button" onClick={() => removeItem(it.id)}>Remove</button>
            </div>
          ))}
          {Array.from({ length: Math.max(0, pageSize - pageItems.length) }).map((_, i) => (
            <div className="inventory-item empty" key={`empty-${i}`} />
          ))}
        </div>

        <div className="inventory-pagination">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
          <div className="page-info">Page {page + 1} / {totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}>Next</button>
        </div>
      </div>
    </div>
  )
}
