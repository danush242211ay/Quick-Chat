// Small inline SVG icons (no icon library needed).
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const BoltIcon = (p) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><path d="M13.2 2 4.5 14h6.3l-1 8 9.7-13h-6.3z" /></svg>
)
export const SendIcon = (p) => (
  <svg {...base} {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
)
export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
)
export const BackIcon = (p) => (
  <svg {...base} {...p}><path d="m15 18-6-6 6-6" /></svg>
)
export const LogoutIcon = (p) => (
  <svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
)
export const TrashIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
)
export const ArrowDownIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
)
export const ClockIcon = (p) => (
  <svg {...base} width={13} height={13} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
// One tick = sent, two ticks = delivered, two accent-coloured ticks = read
export const TickIcon = ({ double, ...p }) => (
  <svg {...base} width={16} height={16} strokeWidth={2.4} {...p}>
    {double ? (
      <>
        <path d="m2 13 4 4L14 8" />
        <path d="m10 14 3 3 9-10" />
      </>
    ) : (
      <path d="m5 13 4 4L19 7" />
    )}
  </svg>
)
