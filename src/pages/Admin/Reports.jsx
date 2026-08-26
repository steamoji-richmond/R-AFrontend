import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getSessionsFromSheets,
  getRegistrationsFromSheets,
  getBranches,
} from '../../api/sheets.js'

// ─── Design tokens ────────────────────────────────────────────────────────────
const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#db2777', '#059669']
const CHART_GRID = '#f1f5f9'
const AXIS_COLOR = '#94a3b8'
const LABEL_COLOR = '#334155'

// ─── Time-range helpers ───────────────────────────────────────────────────────
const RANGES = [
  { id: 'week',     label: 'This Week' },
  { id: 'month',    label: 'This Month' },
  { id: 'year',     label: 'This Year' },
  { id: 'lifetime', label: 'All Time' },
]

function rangeStart(id) {
  const now = new Date()
  if (id === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d
  }
  if (id === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (id === 'year')  return new Date(now.getFullYear(), 0, 1)
  return new Date(0)
}

function monthKey(dt) {
  const d = new Date(dt)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function weekKey(dt) {
  const d = new Date(dt)
  const day = d.getDay()
  const monday = new Date(d); monday.setDate(d.getDate() - ((day+6)%7)); monday.setHours(0,0,0,0)
  return monday.toISOString().slice(0,10)
}
function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(+y, +m-1, 1).toLocaleDateString([], { month: 'short', year: '2-digit' })
}
function weekLabel(key) {
  const d = new Date(key)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─── Data processing ──────────────────────────────────────────────────────────
function process(sessions, registrations, branches, range, branchFilter) {
  const start = rangeStart(range)
  const branchName = (id) => {
    if (!id) return 'Unassigned'
    const b = (branches||[]).find(x => x.id === id)
    return b ? (b.name || id) : id
  }

  // Build a set of session IDs that belong to the selected branch (for reg filtering)
  const branchSessionIds = branchFilter === 'all'
    ? null
    : new Set(sessions.filter(s => (s.branchId || '') === branchFilter).map(s => s.id))

  const filteredSessions = sessions.filter(s => {
    if (new Date(s.dt) < start) return false
    if (branchFilter !== 'all' && (s.branchId || '') !== branchFilter) return false
    return true
  })
  const filteredRegs = registrations.filter(r => {
    const d = r.registeredDateAndTime || r['Registered Date And Time'] || r.sessionDate || ''
    if (!d || new Date(d) < start) return false
    if (branchSessionIds) {
      const sid = r.sessionId || r['Session ID'] || ''
      if (!branchSessionIds.has(sid)) return false
    }
    return true
  })

  // Use weekly bucketing for week range, monthly for everything else
  const useWeekly = range === 'week'
  const keyFn  = useWeekly ? weekKey  : monthKey
  const lblFn  = useWeekly ? weekLabel : monthLabel

  const buckets = {}
  const ensure = k => {
    if (!buckets[k]) buckets[k] = { label: lblFn(k), sessions: 0, registrations: 0, attendance: 0, paid: 0, semi: 0, free: 0 }
  }

  filteredSessions.forEach(s => {
    const k = keyFn(s.dt); ensure(k)
    buckets[k].sessions += 1
    buckets[k].attendance += Array.isArray(s.att) ? s.att.length : 0
  })

  filteredRegs.forEach(r => {
    const date = r.registeredDateAndTime || r['Registered Date And Time'] || r.sessionDate || ''
    if (!date) return
    const k = keyFn(date); ensure(k)
    buckets[k].registrations += 1
    const ps = r.paymentStatus || 'not_required'
    const mt = r.membershipType || 'none'
    if (ps === 'paid' && mt !== 'semi-yearly') buckets[k].paid += 1
    else if (mt === 'semi-yearly') buckets[k].semi += 1
    else buckets[k].free += 1
  })

  const timeline = Object.keys(buckets).sort().map(k => ({ ...buckets[k], key: k }))

  // Branch breakdowns (lifetime — filtered sessions)
  const branchRegsMap = {}
  filteredRegs.forEach(r => {
    const sid = r.sessionId || r['Session ID'] || ''
    const s = sessions.find(x => x.id === sid)
    const name = branchName(s?.branchId || '')
    branchRegsMap[name] = (branchRegsMap[name]||0) + 1
  })
  const branchAttMap = {}
  filteredSessions.forEach(s => {
    const attArr = Array.isArray(s.att) ? s.att : []
    if (!attArr.length) return
    const name = branchName(s.branchId || '')
    branchAttMap[name] = (branchAttMap[name]||0) + attArr.length
  })

  const branchRegData = Object.entries(branchRegsMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)
  const branchAttData = Object.entries(branchAttMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)

  const totalRegs = filteredRegs.length
  const totalAtt  = filteredSessions.reduce((n,s)=>n+(Array.isArray(s.att)?s.att.length:0),0)
  const totalPaid = filteredRegs.filter(r=>r.paymentStatus==='paid').length
  const totalFree = filteredRegs.filter(r=>!r.paymentStatus||r.paymentStatus==='not_required'||Number(r.priceAmount||0)===0).length
  const attRate   = totalRegs > 0 ? Math.round((totalAtt/totalRegs)*100) : 0

  return { timeline, branchRegData, branchAttData, totalRegs, totalAtt, totalPaid, totalFree, attRate, sessionCount: filteredSessions.length }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, color = '#2563eb' }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'18px 20px', flex:'1 1 150px', minWidth:130 }}>
      <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:'1.9rem', fontWeight:800, color, lineHeight:1 }}>{value}</div>
      {delta != null && (
        <div style={{ fontSize:'0.75rem', color: delta>=0 ? '#16a34a' : '#dc2626', marginTop:6, fontWeight:600 }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs prev period
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'22px 24px', marginBottom:18 }}>
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:'0.95rem', fontWeight:700, color:'#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', fontSize:'0.8rem' }}>
      <div style={{ fontWeight:700, color:'#0f172a', marginBottom:6, borderBottom:'1px solid #f1f5f9', paddingBottom:5 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:16, color:LABEL_COLOR, marginBottom:2 }}>
          <span style={{ color: p.color, fontWeight:600 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#0f172a' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', fontSize:'0.8rem' }}>
      <span style={{ fontWeight:700, color:p.payload.fill }}>{p.name}</span>
      <span style={{ marginLeft:10, fontWeight:700, color:'#0f172a' }}>{p.value}</span>
    </div>
  )
}

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.06) return null
  const R = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.52
  return (
    <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)}
      fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent*100).toFixed(0)}%`}
    </text>
  )
}

function PieLegend({ data }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 18px', marginTop:12, justifyContent:'center' }}>
      {data.map((d,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:LABEL_COLOR }}>
          <span style={{ width:9, height:9, borderRadius:2, background:PALETTE[i%PALETTE.length], display:'inline-block', flexShrink:0 }} />
          <span style={{ fontWeight:600 }}>{d.name}</span>
          <span style={{ color:'#94a3b8' }}>({d.value})</span>
        </div>
      ))}
    </div>
  )
}

const axisProps = { tick:{ fontSize:11, fill:AXIS_COLOR }, axisLine:false, tickLine:false }

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [range, setRange]         = useState('lifetime')
  const [branchFilter, setBranchFilter] = useState('all')
  const [loading, setLoading]     = useState(true)
  const [sessions, setSessions]   = useState([])
  const [regs, setRegs]           = useState([])
  const [branches, setBranches]   = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, b] = await Promise.all([
        getSessionsFromSheets(),
        getRegistrationsFromSheets(true),
        getBranches({ activeOnly: false, admin: true }).catch(() => []),
      ])
      setSessions(s || [])
      setRegs(r || [])
      setBranches(b || [])
    } catch (err) {
      alert('Error loading data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const data = useMemo(
    () => process(sessions, regs, branches, range, branchFilter),
    [sessions, regs, branches, range, branchFilter]
  )

  const H = 260

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'#94a3b8', fontSize:'0.9rem', gap:10 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation:'spin 1s linear infinite' }}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Loading analytics…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const { timeline, branchRegData, branchAttData, totalRegs, totalAtt, totalPaid, totalFree, attRate, sessionCount } = data

  return (
    <div style={{ fontFamily:'inherit', maxWidth:1100, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12, marginBottom:22 }}>
        <div>
          <div style={{ fontSize:'1.2rem', fontWeight:800, color:'#0f172a', lineHeight:1.2 }}>Analytics Overview</div>
          <div style={{ fontSize:'0.8rem', color:'#94a3b8', marginTop:4 }}>
            {range === 'week' ? 'Past 7 days' : range === 'month' ? 'Current month' : range === 'year' ? 'Current year' : 'All time'}
            {branchFilter !== 'all' && (
              <span style={{ marginLeft:8, background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:999, padding:'1px 8px', fontSize:'0.72rem', fontWeight:700 }}>
                {branches.find(b => b.id === branchFilter)?.name || branchFilter}
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Branch filter */}
          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              style={{
                padding:'7px 10px', fontSize:'0.78rem', fontWeight:600,
                background:'#fff', border:'1px solid #e2e8f0', borderRadius:8,
                color:'#475569', cursor:'pointer', minWidth:130,
                height:34, outline:'none',
              }}
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name || b.id}</option>
              ))}
            </select>
          )}

          {/* Range toggle */}
          <div style={{ display:'flex', background:'#f1f5f9', borderRadius:8, padding:3, gap:2 }}>
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{
                padding:'6px 13px', fontSize:'0.78rem', fontWeight:600, border:'none', borderRadius:6, cursor:'pointer',
                background: range === r.id ? '#fff' : 'transparent',
                color: range === r.id ? '#0f172a' : '#64748b',
                boxShadow: range === r.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition:'all 0.15s',
              }}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={load} style={{ padding:'7px 13px', fontSize:'0.78rem', fontWeight:600, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#475569', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        <KpiCard label="Sessions"      value={sessionCount} color="#2563eb" />
        <KpiCard label="Registrations" value={totalRegs}    color="#7c3aed" />
        <KpiCard label="Attendance"    value={totalAtt}     color="#16a34a" />
        <KpiCard label="Attendance Rate" value={`${attRate}%`} color={attRate >= 70 ? '#16a34a' : '#d97706'} />
        <KpiCard label="Paid"          value={totalPaid}    color="#0891b2" />
        <KpiCard label="Free / Annual" value={totalFree}    color="#64748b" />
      </div>

      {/* Growth chart */}
      <ChartCard title="Workshop Growth" subtitle="Sessions and registrations per period">
        <ResponsiveContainer width="100%" height={H}>
          <BarChart data={timeline} barGap={3} margin={{ top:4, right:8, left:-10, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill:'#f8fafc' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'0.78rem', paddingTop:10 }} />
            <Bar dataKey="sessions"      name="Sessions"      fill="#bfdbfe" radius={[3,3,0,0]} maxBarSize={36} />
            <Bar dataKey="registrations" name="Registrations" fill="#2563eb" radius={[3,3,0,0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Reg vs Attendance */}
      <ChartCard title="Registrations vs Attendance" subtitle="How many who registered actually showed up">
        <ResponsiveContainer width="100%" height={H}>
          <BarChart data={timeline} barGap={3} margin={{ top:4, right:8, left:-10, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill:'#f8fafc' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'0.78rem', paddingTop:10 }} />
            <Bar dataKey="registrations" name="Registered" fill="#7c3aed" radius={[3,3,0,0]} maxBarSize={36} />
            <Bar dataKey="attendance"    name="Attended"   fill="#16a34a" radius={[3,3,0,0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Payment breakdown */}
      <ChartCard title="Payment Breakdown" subtitle="Paid in full · Non-annual (50% off) · Free / annual covered">
        <ResponsiveContainer width="100%" height={H}>
          <BarChart data={timeline} margin={{ top:4, right:8, left:-10, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill:'#f8fafc' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'0.78rem', paddingTop:10 }} />
            <Bar dataKey="paid" name="Paid (full)"        stackId="s" fill="#0891b2" />
            <Bar dataKey="semi" name="Non-annual (50% off)"  stackId="s" fill="#d97706" />
            <Bar dataKey="free" name="Free / Covered"     stackId="s" fill="#cbd5e1" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Trend line */}
      <ChartCard title="Registration Trend" subtitle="Running trend of registrations and attendance">
        <ResponsiveContainer width="100%" height={H}>
          <LineChart data={timeline} margin={{ top:4, right:8, left:-10, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'0.78rem', paddingTop:10 }} />
            <Line type="monotone" dataKey="registrations" name="Registrations" stroke="#7c3aed" strokeWidth={2.5} dot={{ r:3, fill:'#7c3aed' }} activeDot={{ r:5 }} />
            <Line type="monotone" dataKey="attendance"    name="Attendance"    stroke="#16a34a" strokeWidth={2.5} dot={{ r:3, fill:'#16a34a' }} activeDot={{ r:5 }} strokeDasharray="6 3" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Pie charts */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:18, marginBottom:18 }}>
        <ChartCard title="Registrations by Branch" subtitle="Distribution of sign-ups across locations">
          {branchRegData.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8', padding:32, fontSize:'0.85rem' }}>No branch data available</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={branchRegData} dataKey="value" cx="50%" cy="50%" outerRadius={82} labelLine={false} label={<PieLabel />}>
                    {branchRegData.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend data={branchRegData} />
            </>
          )}
        </ChartCard>

        <ChartCard title="Attendance by Branch" subtitle="Which locations have the strongest turn-out">
          {branchAttData.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8', padding:32, fontSize:'0.85rem' }}>No attendance data available</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={branchAttData} dataKey="value" cx="50%" cy="50%" outerRadius={82} labelLine={false} label={<PieLabel />}>
                    {branchAttData.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend data={branchAttData} />
            </>
          )}
        </ChartCard>
      </div>

      {/* Summary table */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden', marginBottom:8 }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ fontSize:'0.95rem', fontWeight:700, color:'#0f172a' }}>Period Summary</div>
          <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>Breakdown by period — most recent first</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Period','Sessions','Registered','Attended','Rate','Paid','Semi','Free'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign: h==='Period'?'left':'right', fontWeight:700, color:'#475569', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeline.length === 0 && (
                <tr><td colSpan={8} style={{ padding:28, textAlign:'center', color:'#94a3b8' }}>No data for this period</td></tr>
              )}
              {[...timeline].reverse().map((row, i) => {
                const rate = row.registrations > 0 ? Math.round((row.attendance/row.registrations)*100) : null
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    <td style={{ padding:'10px 14px', fontWeight:600, color:'#0f172a' }}>{row.label}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#475569' }}>{row.sessions}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#7c3aed', fontWeight:600 }}>{row.registrations}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#16a34a', fontWeight:600 }}>{row.attendance}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color: rate == null ? '#94a3b8' : rate>=70 ? '#16a34a' : '#d97706' }}>
                      {rate != null ? `${rate}%` : '—'}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#0891b2' }}>{row.paid}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#d97706' }}>{row.semi}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', color:'#64748b' }}>{row.free}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
