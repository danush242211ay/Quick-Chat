import { hueFromString, initials } from '../lib/format'

export default function Avatar({ name, size = 44, online }) {
  const hue = hueFromString(name)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      <span
        className="avatar__face"
        style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 42%))` }}
      >
        {initials(name)}
      </span>
      {online !== undefined && <span className={`avatar__dot ${online ? 'avatar__dot--on' : ''}`} title={online ? 'Online' : 'Offline'} />}
    </span>
  )
}
