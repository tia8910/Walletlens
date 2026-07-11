import { loadData, saveData, bumpId } from './storage'

const KEY = 'vision_buckets'
const ID_KEY = 'crypto_tracker_next_vision_id'

export const BUCKET_TYPES = {
  emergency:  { label: 'Emergency Fund',   icon: 'shield',  desc: 'Safety net for unexpected costs' },
  withdrawal: { label: 'Withdrawal Plan',  icon: 'banknote',  desc: 'Regular income or spending drawdown' },
  hold:       { label: 'Long-term Hold',   icon: 'lock',  desc: 'Assets to hold and not touch' },
  invest:     { label: 'Investment Goal',  icon: 'trend-up',  desc: 'Growth-focused allocation' },
  rest:       { label: 'Everything Else',  icon: 'folder',  desc: 'Remaining portfolio not yet allocated' },
}

export const BUCKET_COLORS = [
  '#6366f1','#10b981','#f59e0b','#0ea5e9','#f97316',
  '#8b5cf6','#ec4899','#14b8a6','#ef4444','#84cc16',
]

export function loadBuckets() {
  return loadData(KEY, [])
}

export function saveBuckets(buckets) {
  saveData(KEY, buckets)
}

export function newBucket(overrides = {}) {
  const id = bumpId(ID_KEY)
  return {
    id,
    name: '',
    type: 'hold',
    targetAmount: null,   // fixed USD target
    targetPct: null,      // % of net worth target (0–100)
    isRest: false,        // true = auto shows everything not in other buckets
    monthlyWithdrawal: null,    // $ drawn down each month (runway)
    monthlyContribution: null,  // $ added each month (goal progress)
    targetMonths: null,         // timeframe in months to reach the target
    manualAmount: null,         // manually-entered current value (planning without live holdings)
    categories: [],             // planned asset-class focus, e.g. ['crypto','cash']
    linkedAssets: [],     // array of coin_ids (live current value)
    color: BUCKET_COLORS[(id - 1) % BUCKET_COLORS.length],
    notes: '',
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}
