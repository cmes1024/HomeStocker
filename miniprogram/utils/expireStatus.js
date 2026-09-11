/**
 * 保质期状态（Asia/Shanghai 日历日）。
 * expireDate: YYYY-MM-DD 或空；无有效日期 → status ''。
 * expiring 窗：今天 … 今天+3（含）。
 */
function shanghaiTodayYmd(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now))
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function normalizeDateInput(value) {
  if (value === undefined || value === null || value === '') return null
  const s = String(value).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  return s
}

/**
 * @returns {{ status: ''|'normal'|'expiring'|'expired', label: string }}
 */
function shelfLifeStatus(expireDate, now = Date.now()) {
  const date = normalizeDateInput(expireDate)
  if (!date) return { status: '', label: '' }
  if (date === undefined) return { status: '', label: '' }

  const today = shanghaiTodayYmd(now)
  if (date < today) return { status: 'expired', label: '已过期' }
  const end = addDaysYmd(today, 3)
  if (date <= end) return { status: 'expiring', label: '即将过期' }
  return { status: 'normal', label: '' }
}

function isInExpiringWindow(expireDate, now = Date.now()) {
  const { status } = shelfLifeStatus(expireDate, now)
  return status === 'expiring' || status === 'expired'
}

module.exports = {
  shanghaiTodayYmd,
  addDaysYmd,
  normalizeDateInput,
  shelfLifeStatus,
  isInExpiringWindow
}
