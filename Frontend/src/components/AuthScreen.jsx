import { useState } from 'react'
import { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { BoltIcon } from './Icons'

export default function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isRegister) await register(form.fullName, form.email, form.password)
      else await login(form.email, form.password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
    // On success this screen unmounts (the user becomes logged in), so no need to reset `busy`.
  }

  return (
    <main className="auth">
      <section className="auth__brand" aria-hidden="true">
        <div className="logo">
          <span className="logo__mark"><BoltIcon width={22} height={22} /></span>
          <span className="logo__text">Quick Chat</span>
        </div>
        <h1 className="auth__headline">
          Say it fast.
          <br />
          <span>Hear back faster.</span>
        </h1>
        <p className="auth__sub">Real-time messages, live presence, typing indicators and read receipts — all over a single WebSocket.</p>

        <div className="auth__demo">
          <div className="demo-bubble demo-bubble--in">Are you online? 👀</div>
          <div className="demo-bubble demo-bubble--out">
            Yep! Just opened the app
            <span className="demo-ticks">✓✓</span>
          </div>
          <div className="demo-bubble demo-bubble--in demo-bubble--typing">
            <i /><i /><i />
          </div>
        </div>
      </section>

      <section className="auth__panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="logo logo--small">
            <span className="logo__mark"><BoltIcon width={18} height={18} /></span>
            <span className="logo__text">Quick Chat</span>
          </div>

          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!isRegister} className={`tab ${!isRegister ? 'tab--on' : ''}`} onClick={() => switchMode('login')}>
              Log in
            </button>
            <button type="button" role="tab" aria-selected={isRegister} className={`tab ${isRegister ? 'tab--on' : ''}`} onClick={() => switchMode('register')}>
              Sign up
            </button>
          </div>

          <h2 className="auth-card__title">{isRegister ? 'Create your account' : 'Welcome back'}</h2>

          {isRegister && (
            <label className="field">
              <span>Full name</span>
              <input value={form.fullName} onChange={update('fullName')} placeholder="Ada Lovelace" autoComplete="name" maxLength={60} required />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder={isRegister ? 'At least 6 characters' : '••••••••'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 6 : undefined}
              required
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="btn btn--primary" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>

          <p className="auth-card__hint">
            {isRegister ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
              {isRegister ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </section>
    </main>
  )
}
