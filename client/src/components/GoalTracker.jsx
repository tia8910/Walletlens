import { useState, useEffect } from 'react'

const LS_KEY = 'wl_goals'

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function saveGoals(goals) {
  localStorage.setItem(LS_KEY, JSON.stringify(goals))
}

function ProgressRing({ pct }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const filled = Math.min(pct / 100, 1) * circ
  return (
    <svg width="88" height="88" style={{ flexShrink: 0 }}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#3b82f6'}
        strokeWidth="7"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="44" y="49" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">
        {Math.min(Math.round(pct), 100)}%
      </text>
    </svg>
  )
}

function calcGoal(goal, currentValue) {
  const now = new Date()
  const target = new Date(goal.targetDate)
  const daysLeft = Math.max(0, Math.round((target - now) / 86400000))
  const monthsLeft = Math.max(0, (target - now) / (1000 * 60 * 60 * 24 * 30.44))
  const pct = goal.targetAmount > 0 ? (currentValue / goal.targetAmount) * 100 : 0
  const remaining = Math.max(0, goal.targetAmount - currentValue)
  const dcaNeeded = monthsLeft > 0 ? remaining / monthsLeft : 0

  let probLabel, probColor
  const neededGrowthPct = currentValue > 0
    ? ((goal.targetAmount / currentValue) ** (1 / Math.max(monthsLeft / 12, 0.01)) - 1) * 100
    : Infinity
  if (pct >= 100 || neededGrowthPct <= 15) {
    probLabel = '🟢 Likely'
    probColor = '#22c55e'
  } else if (neededGrowthPct <= 40) {
    probLabel = '🟡 Possible'
    probColor = '#f59e0b'
  } else {
    probLabel = '🔴 Stretch'
    probColor = '#f87171'
  }

  return { pct, remaining, dcaNeeded, daysLeft, probLabel, probColor }
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(2)
}

export default function GoalTracker({ currentValue }) {
  const [goals, setGoals] = useState(loadGoals)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ label: '', targetAmount: '', targetDate: '' })

  useEffect(() => { saveGoals(goals) }, [goals])

  function addGoal() {
    if (!form.targetAmount || !form.targetDate) return
    const goal = {
      id: Date.now().toString(),
      label: form.label || 'My Goal',
      targetAmount: parseFloat(form.targetAmount),
      targetDate: form.targetDate,
    }
    setGoals(g => [...g, goal])
    setForm({ label: '', targetAmount: '', targetDate: '' })
    setShowForm(false)
  }

  function deleteGoal(id) {
    setGoals(g => g.filter(x => x.id !== id))
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    borderRadius: '8px',
    color: '#fff',
    padding: '0.45rem 0.7rem',
    fontSize: '0.82rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '16px',
      padding: '1rem 1.1rem',
      marginBottom: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: goals.length > 0 || showForm ? '0.9rem' : 0 }}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'rgba(255,255,255,0.85)' }}>
          🎯 Portfolio Goals
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              color: 'rgba(255,255,255,0.7)',
              padding: '0.3rem 0.7rem',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            + Add Goal
          </button>
        )}
      </div>

      {goals.length === 0 && !showForm && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>
          Set a portfolio goal to track your progress.
        </p>
      )}

      {goals.map(goal => {
        const { pct, remaining, dcaNeeded, daysLeft, probLabel, probColor } = calcGoal(goal, currentValue)
        return (
          <div key={goal.id} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '0.85rem',
            marginBottom: '0.65rem',
            display: 'flex',
            gap: '0.9rem',
            alignItems: 'center',
          }}>
            <ProgressRing pct={pct} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>{goal.label}</span>
                <button
                  onClick={() => deleteGoal(goal.id)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 0 0 0.5rem', flexShrink: 0 }}
                  title="Remove goal"
                >×</button>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', margin: '0.2rem 0' }}>
                ${fmt(currentValue)} of ${fmt(goal.targetAmount)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.3rem' }}>
                Need <strong style={{ color: '#fff' }}>${fmt(dcaNeeded)}/mo</strong> DCA · {daysLeft}d left
              </div>
              <span style={{
                display: 'inline-block',
                background: probColor + '22',
                border: `1px solid ${probColor}55`,
                borderRadius: '6px',
                padding: '0.15rem 0.5rem',
                fontSize: '0.72rem',
                color: probColor,
                fontWeight: 600,
              }}>
                {probLabel}
              </span>
            </div>
          </div>
        )
      })}

      {showForm && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
        }}>
          <input
            style={inputStyle}
            placeholder="Label (e.g. Lambo Fund)"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          />
          <input
            style={inputStyle}
            type="number"
            placeholder="Target amount (USD)"
            value={form.targetAmount}
            onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))}
          />
          <input
            style={{ ...inputStyle, colorScheme: 'dark' }}
            type="date"
            value={form.targetDate}
            onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={addGoal}
              style={{
                flex: 1,
                background: 'rgba(34,197,94,0.18)',
                border: '1px solid rgba(34,197,94,0.35)',
                borderRadius: '8px',
                color: '#22c55e',
                padding: '0.45rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ label: '', targetAmount: '', targetDate: '' }) }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: 'rgba(255,255,255,0.5)',
                padding: '0.45rem',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
