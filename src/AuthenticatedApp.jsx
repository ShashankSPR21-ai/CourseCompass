import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Dashboard from './Dashboard'
import AdminDashboard from './AdminDashboard'
import CoordinatorDashboard from './CoordinatorDashboard'
import './AuthenticatedApp.css'

function LogoutButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="auth-screen-btn"
    >
      {disabled ? 'Logging out…' : 'Log out'}
    </button>
  )
}

export default function AuthenticatedApp({ user, onLogout }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setLoading(true)
      setError('')
      setProfile(null)

      try {
        if (!user?.id) {
          setError('Unable to identify your account. Please log in again.')
          return
        }

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('role, approval_status')
          .eq('id', user.id)
          .maybeSingle()

        if (!active) return

        if (profileError) {
          setError(
            `Unable to verify your account: ${profileError.message}`
          )
          return
        }

        if (!data) {
          setError(
            'Your profile was not found. Please contact support.'
          )
          return
        }

        setProfile(data)
      } catch (err) {
        if (active) {
          setError(
            err?.message || 'An unexpected error occurred.'
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [user?.id])

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)
    setError('')

    try {
      const { error: logoutError } = await supabase.auth.signOut()

      if (logoutError) {
        throw logoutError
      }

      if (typeof onLogout === 'function') {
        await onLogout()
      }
    } catch (err) {
      console.error('Logout failed:', err)

      setError(
        `Logout failed: ${
          err?.message || 'Please try again.'
        }`
      )
    } finally {
      setLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-screen-card">
          <div className="auth-screen-spinner" aria-hidden="true" />
          <h2>Verifying your account</h2>
          <p>Please wait while we load your dashboard.</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="auth-screen">
        <div className="auth-screen-card">
          <div className="auth-screen-icon icon-error">!</div>
          <h2>Unable to verify account</h2>
          {error && <div className="auth-screen-alert" role="alert">{error}</div>}
          {!error && <p>Your profile could not be verified.</p>}
          <LogoutButton onClick={handleLogout} disabled={loggingOut} />
        </div>
      </div>
    )
  }

  // Block accounts that have not been approved.
  if (profile.approval_status !== 'approved') {
    if (profile.approval_status === 'pending') {
      return (
        <div className="auth-screen">
          <div className="auth-screen-card">
            <div className="auth-screen-icon icon-warning">⏳</div>
            <h2>Account awaiting approval</h2>
            <p>Your account is pending approval by an administrator. You will be notified once it has been reviewed.</p>
            <LogoutButton onClick={handleLogout} disabled={loggingOut} />
          </div>
        </div>
      )
    }

    if (profile.approval_status === 'rejected') {
      return (
        <div className="auth-screen">
          <div className="auth-screen-card">
            <div className="auth-screen-icon icon-error">✕</div>
            <h2>Account not approved</h2>
            <p>Please contact the administrator if you believe this is an error.</p>
            <LogoutButton onClick={handleLogout} disabled={loggingOut} />
          </div>
        </div>
      )
    }

    return (
      <div className="auth-screen">
        <div className="auth-screen-card">
          <div className="auth-screen-icon icon-warning">?</div>
          <h2>Account approval required</h2>
          <p>Your account does not have an approved status. Please contact the administrator.</p>
          <LogoutButton onClick={handleLogout} disabled={loggingOut} />
        </div>
      </div>
    )
  }

  // Only administrators can access the admin dashboard.
  if (profile.role === 'admin') {
    return (
      <AdminDashboard
        key={user.id}
        user={user}
        onLogout={handleLogout}
      />
    )
  }

  // Only coordinators can access the coordinator dashboard.
  if (profile.role === 'coordinator') {
    return (
      <CoordinatorDashboard
        key={user.id}
        user={user}
        onLogout={handleLogout}
      />
    )
  }

  // Students receive only the student dashboard.
  if (profile.role === 'student') {
    return (
      <Dashboard
        key={user.id}
        user={user}
        onLogout={handleLogout}
      />
    )
  }

  // Do not show a dashboard for unknown roles.
  return (
    <div className="auth-screen">
      <div className="auth-screen-card">
        <div className="auth-screen-icon icon-error">?</div>
        <h2>Unknown account role</h2>
        <p>Your account role is not recognized. Please contact support.</p>
        <LogoutButton onClick={handleLogout} disabled={loggingOut} />
      </div>
    </div>
  )
}
