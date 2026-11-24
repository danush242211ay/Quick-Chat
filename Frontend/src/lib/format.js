const sameDay = (a, b) => a.toDateString() === b.toDateString()

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// "Today", "Yesterday", "Monday", or "12 Mar 2025" — used for the dividers inside a chat.
export function dayLabel(iso) {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  const daysAgo = (now - d) / 86_400_000
  if (daysAgo < 6) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

// Short stamp for the sidebar: time today, otherwise "Yesterday" / "12 Mar".
export function sidebarTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return formatTime(iso)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function lastSeenLabel(iso) {
  if (!iso) return 'offline'
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return `last seen today at ${formatTime(iso)}`
  if (sameDay(d, yesterday)) return `last seen yesterday at ${formatTime(iso)}`
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Stable colour per person, derived from their name.
export function hueFromString(str = '') {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 360
  return hash
}
