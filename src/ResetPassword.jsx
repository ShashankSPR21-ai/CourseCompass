import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './Auth.css'

// Shown after the user opens the link in the "reset password" email.
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      window.history.replaceState({}, '', window.location.pathname)
      onDone()
    } catch (err) {
      setError(err.message || 'Could not update the password. Request a new reset link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-backdrop">
      <div className="auth-card" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Set a new password</h2>
        <p className="auth-subtitle">Choose a new password for your CourseCompass account.</p>

        <form onSubmit={handleSubmit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
