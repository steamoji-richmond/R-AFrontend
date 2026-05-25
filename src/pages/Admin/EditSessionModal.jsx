import { useState } from 'react'
import AdminModal from '../../components/AdminModal.jsx'

export default function EditSessionModal({ session, branches = [], onCancel, onSave }) {
  const dt = new Date(session.dt)
  const [date, setDate] = useState(dt.toISOString().slice(0, 10))
  const pad = (n) => String(n).padStart(2, '0')
  const [time, setTime] = useState(`${pad(dt.getHours())}:${pad(dt.getMinutes())}`)
  const [topic, setTopic] = useState(session.topic || 'Public Speaking')
  const [cap, setCap] = useState(session.capacity || 10)
  const [price, setPrice] = useState(Number(session.price) || 0)
  const [branchId, setBranchId] = useState(session.branchId || '')

  const activeBranches = branches.filter(
    (b) => b.active !== false || b.id === session.branchId
  )


  const submit = () => {
    if (!date || !time) {
      alert('Please enter both date and time')
      return
    }
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    const newDt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
    onSave({
      ...session,
      dt: newDt.toISOString(),
      topic: topic || 'Public Speaking',
      capacity: Number(cap) || 10,
      price: Math.max(0, Number(price) || 0),
      currency: 'CAD',
      branchId: branchId || '',
    })
  }

  return (
    <AdminModal onDismiss={onCancel}>
      <div className="card admin-dialog-card">
        <h2>Edit Session</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeBranches.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Branch
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— No branch —</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.code ? ` (${b.code})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Topic
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Capacity
            <input
              type="number"
              min="1"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Price (CAD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <span className="caption">
              Yearly members: free • Semi-yearly: 50% off • Others: full
            </span>
          </label>
        </div>
        <div
          className="row"
          style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}
        >
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </AdminModal>
  )
}
