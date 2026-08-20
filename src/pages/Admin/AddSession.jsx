import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { saveSessionToSheets } from '../../api/sheets.js'

export default function AddSession({ branches = [], onAdded }) {
  const { showToast } = useApp()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [cap, setCap] = useState(10)
  const [topic, setTopic] = useState('')
  const [price, setPrice] = useState(0)
  const [branchId, setBranchId] = useState('')

  const activeBranches = branches.filter((b) => b.active !== false)

  // Default-select the first branch once the list loads so admins don't
  // have to manually pick a branch for every single-location install.
  useEffect(() => {
    if (!branchId && activeBranches.length === 1) {
      setBranchId(activeBranches[0].id)
    }
  }, [activeBranches, branchId])

  const reset = () => {
    setDate('')
    setTime('')
    setCap(10)
    setTopic('')
    setPrice(0)
    // Keep the branch selection so admins can create several sessions in a row
  }

  const add = async () => {
    if (!date || !time) {
      alert('Pick date and time')
      return
    }
    if (activeBranches.length > 0 && !branchId) {
      alert('Please pick a branch for this session')
      return
    }
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    const dt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
    const newSession = {
      id: 'S' + Math.random().toString(36).slice(2, 9),
      dt: dt.toISOString(),
      topic: topic || 'Public Speaking',
      capacity: Number(cap) || 10,
      price: Math.max(0, Number(price) || 0),
      currency: 'CAD',
      branchId: branchId || '',
      reg: [],
      att: [],
    }
    try {
      await saveSessionToSheets(newSession)
      showToast('Session added')
      reset()
      onAdded && onAdded()
    } catch (err) {
      console.error('Error saving session:', err)
      alert('Failed to save session: ' + (err.message || 'Unknown error'))
    }
  }

  return (
    <div className="panel">
      <p className="caption muted" style={{ margin: '0 0 12px' }}>
        Create a workshop date; it appears in Session Management and public registration
        once saved.
      </p>

      {activeBranches.length === 0 ? (
        <div
          className="caption"
          style={{
            color: 'var(--danger)',
            background: 'var(--bg-light)',
            padding: 10,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          No active branches found. Go to <strong>Branches</strong> first and
          create at least one branch before adding sessions.
        </div>
      ) : (
        <label style={{ display: 'block', marginBottom: 12 }}>
          Branch <span style={{ color: 'var(--danger)' }}>*</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            required
          >
            <option value="">— Select a branch —</option>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.code ? ` (${b.code})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="row wrap">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min="1"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <label>
          Price (CAD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            title="Full price before GST. Annual members free, non-annual 40% off, others full price. 5% GST added at checkout."
          />
        </label>
      </div>
      <label>
        Topic
        <input
          placeholder="Public Speaking"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      <p className="caption" style={{ marginTop: 6 }}>
        Session price is before GST. Square checkout adds 5% GST. Annual Membership: free • Non Annual Membership: 40% off • Non-Steamoji members: Pays full price
      </p>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button
          className="primary"
          onClick={add}
          disabled={activeBranches.length === 0}
        >
          Add session
        </button>
        <button className="primary" onClick={reset}>
          Reset form
        </button>
      </div>
    </div>
  )
}
