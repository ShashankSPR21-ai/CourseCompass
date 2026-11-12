import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './Auth.css'

// Must match "Email OTP Length" in Supabase → Authentication → Providers → Email (default 6).
const OTP_LENGTH = 6
// Supabase only allows one OTP email per 60 seconds for the same address.
const RESEND_SECONDS = 60

export default function Auth({ mode, onClose }) {
  const [isSignup, setIsSignup] = useState(mode === 'signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Email verification (OTP sent through Resend, via Supabase custom SMTP)
  const [step, setStep] = useState('form') // 'form' | 'otp'
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [cooldown, setCooldown] = useState(0)
  const [verifying, setVerifying] = useState(false)
  const otpRefs = useRef([])

  // Signup: who are you?  (students are approved instantly, coordinators wait for an admin)
  const [accountType, setAccountType] = useState('student')
  const [phone, setPhone] = useState('')
  const [colleges, setColleges] = useState([])
  const [collegesLoading, setCollegesLoading] = useState(false)
  const [collegeChoice, setCollegeChoice] = useState('')
  const [newCollegeName, setNewCollegeName] = useState('')
  const [newCollegeCity, setNewCollegeCity] = useState('')

  const isCoordinator = isSignup && accountType === 'coordinator'
  const collegeNotListed = collegeChoice === '__other__'

  // Load the colleges that do not have a coordinator yet (only when needed).
  useEffect(() => {
    if (!isCoordinator || colleges.length > 0) return

    let active = true

    async function loadColleges() {
      setCollegesLoading(true)

      const { data, error: rpcError } = await supabase.rpc(
        'list_claimable_colleges',
      )

      if (!active) return

      if (rpcError) {
        console.error('Could not load colleges:', rpcError.message)
        setColleges([])
      } else {
        setColleges(data || [])
      }

      setCollegesLoading(false)
    }

    loadColleges()

    return () => {
      active = false
    }
  }, [isCoordinator, colleges.length])

  // Count down the "Resend code" button.
  useEffect(() => {
    if (cooldown <= 0) return undefined

    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)

    return () => window.clearTimeout(timer)
  }, [cooldown])

  // Focus the first box when the code screen opens.
  useEffect(() => {
    if (step === 'otp') {
      window.setTimeout(() => otpRefs.current[0]?.focus(), 60)
    }
  }, [step])

  function goToOtpStep(notice) {
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setStep('otp')
    setCooldown(RESEND_SECONDS)
    setError('')
    setMessage(notice || '')
  }

  async function verifyCode(code) {
    if (verifying) return

    setVerifying(true)
    setError('')
    setMessage('')

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'signup',
      })

      if (verifyError) {
        throw verifyError
      }

      // verifyOtp signs the user in. App.jsx listens to onAuthStateChange and
      // routes them to the right dashboard (student / coordinator / admin),
      // including the "waiting for approval" screen for coordinators.
      setMessage('Email verified! Taking you to CourseCompass…')

      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err) {
      setOtpDigits(Array(OTP_LENGTH).fill(''))
      window.setTimeout(() => otpRefs.current[0]?.focus(), 30)

      const text = String(err?.message || '')

      setError(
        /expired|invalid/i.test(text)
          ? 'That code is wrong or has expired. Check the latest email or request a new code.'
          : text || 'Could not verify the code. Please try again.',
      )
    } finally {
      setVerifying(false)
    }
  }

  function handleDigitChange(index, rawValue) {
    const value = rawValue.replace(/\D/g, '')

    if (!value) {
      setOtpDigits((previous) => previous.map((d, i) => (i === index ? '' : d)))
      return
    }

    // Typing or pasting several digits fills the following boxes too.
    const next = [...otpDigits]

    value
      .slice(0, OTP_LENGTH - index)
      .split('')
      .forEach((digit, offset) => {
        next[index + offset] = digit
      })

    setOtpDigits(next)

    const focusIndex = Math.min(index + value.length, OTP_LENGTH - 1)
    otpRefs.current[focusIndex]?.focus()

    if (next.every(Boolean)) {
      verifyCode(next.join(''))
    }
  }

  function handleDigitKeyDown(index, event) {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }

    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpSubmit(event) {
    event.preventDefault()

    const code = otpDigits.join('')

    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`)
      return
    }

    verifyCode(code)
  }

  async function handleResendCode() {
    if (cooldown > 0 || loading) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })

      if (resendError) {
        throw resendError
      }

      setOtpDigits(Array(OTP_LENGTH).fill(''))
      setCooldown(RESEND_SECONDS)
      setMessage('A new code is on its way. Please check your inbox and spam folder.')
      window.setTimeout(() => otpRefs.current[0]?.focus(), 30)
    } catch (err) {
      setError(err?.message || 'Could not resend the code. Please try again shortly.')
    } finally {
      setLoading(false)
    }
  }

  function backToForm() {
    setStep('form')
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setMessage('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setLoading(true)
    setMessage('')
    setError('')

    try {
      if (isSignup) {
        if (password.length < 8) {
          throw new Error('Password must contain at least 8 characters.')
        }

        if (accountType === 'coordinator') {
          if (!collegeChoice) {
            throw new Error('Please select the college you coordinate.')
          }
          if (collegeNotListed && !newCollegeName.trim()) {
            throw new Error('Enter the name of your college.')
          }
        }

        // The database trigger validates all of this again – "admin" can never be chosen here.
        const metadata = {
          full_name: fullName.trim(),
          role: accountType,
        }

        if (accountType === 'coordinator') {
          metadata.phone = phone.trim()

          if (collegeNotListed) {
            metadata.requested_college_name = newCollegeName.trim()
            metadata.requested_college_city = newCollegeCity.trim()
          } else {
            metadata.requested_college_id = collegeChoice
          }
        }

        const { data: signupData, error: signupError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: metadata,
            },
          })

        if (signupError) {
          throw signupError
        }

        // Supabase hides "already registered" emails by returning a user with
        // no identities instead of an error.
        if (signupData?.user && signupData.user.identities?.length === 0) {
          throw new Error(
            'This email is already registered. Please log in instead.',
          )
        }

        // If email confirmation is switched off in Supabase the user already
        // has a session and App.jsx will take over automatically.
        if (signupData?.session) {
          onClose()
          return
        }

        goToOtpStep(
          `We sent a ${OTP_LENGTH}-digit verification code to ${email.trim()}.`,
        )
      } else {
        const { error: loginError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })

        if (loginError) {
          // Signed up earlier but never entered the code → send a fresh one.
          if (
            loginError.code === 'email_not_confirmed' ||
            /email not confirmed/i.test(loginError.message || '')
          ) {
            const { error: resendError } = await supabase.auth.resend({
              type: 'signup',
              email: email.trim(),
            })

            if (resendError) {
              throw resendError
            }

            goToOtpStep(
              'Your email is not verified yet. We sent a new code to your inbox.',
            )
            return
          }

          throw loginError
        }

        setMessage('Login successful! Welcome to CourseCompass.')

        setTimeout(() => {
          onClose()
          window.location.reload()
        }, 1000)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordReset() {
    setMessage('')
    setError('')

    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }

    setLoading(true)

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })

      if (resetError) {
        throw resetError
      }

      setMessage(
        'If the account exists, a password reset email will be sent.',
      )
    } catch (err) {
      setError(err.message || 'Unable to send the reset email.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setIsSignup((previousMode) => !previousMode)
    setMessage('')
    setError('')
    setPassword('')
  }

  if (step === 'otp') {
    return (
      <div className="auth-backdrop" onClick={onClose}>
        <section
          className="auth-card auth-card-otp"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="auth-close"
            onClick={onClose}
            aria-label="Close authentication window"
          >
            ×
          </button>

          <div className="auth-logo auth-logo-mail" aria-hidden="true">
            ✉
          </div>

          <span className="auth-eyebrow">VERIFY YOUR EMAIL</span>

          <h2 id="auth-title">Enter your code</h2>

          <p className="auth-subtitle">
            We emailed a {OTP_LENGTH}-digit code to <strong>{email.trim()}</strong>.
            It expires in a few minutes.
          </p>

          <form onSubmit={handleOtpSubmit}>
            <div
              className="auth-otp"
              role="group"
              aria-label={`${OTP_LENGTH}-digit verification code`}
            >
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    otpRefs.current[index] = node
                  }}
                  className={`auth-otp-box${digit ? ' filled' : ''}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={OTP_LENGTH}
                  value={digit}
                  disabled={verifying}
                  aria-label={`Digit ${index + 1}`}
                  onChange={(event) =>
                    handleDigitChange(index, event.target.value)
                  }
                  onKeyDown={(event) => handleDigitKeyDown(index, event)}
                  onFocus={(event) => event.target.select()}
                />
              ))}
            </div>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            {message && (
              <p className="auth-success" role="status">
                {message}
              </p>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={verifying || otpDigits.some((digit) => !digit)}
            >
              {verifying ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>

          <p className="auth-switch">
            Didn’t get the email?{' '}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={cooldown > 0 || loading}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </p>

          <p className="auth-switch">
            <button type="button" onClick={backToForm}>
              ← Use a different email
            </button>
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <section
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="auth-close"
          onClick={onClose}
          aria-label="Close authentication window"
        >
          ×
        </button>

        <div className="auth-logo">C</div>

        <span className="auth-eyebrow">WELCOME TO COURSECOMPASS</span>

        <h2 id="auth-title">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h2>

        <p className="auth-subtitle">
          {isSignup
            ? 'Start exploring courses and planning your future.'
            : 'Sign in to continue your journey.'}
        </p>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div className="auth-field">
              <span className="auth-field-label">I am a</span>

              <div
                className="auth-role-toggle"
                role="radiogroup"
                aria-label="Account type"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={accountType === 'student'}
                  className={accountType === 'student' ? 'active' : ''}
                  onClick={() => setAccountType('student')}
                >
                  <strong>Student</strong>
                  <small>Explore &amp; compare colleges</small>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={accountType === 'coordinator'}
                  className={accountType === 'coordinator' ? 'active' : ''}
                  onClick={() => setAccountType('coordinator')}
                >
                  <strong>College coordinator</strong>
                  <small>Manage your college&apos;s page</small>
                </button>
              </div>
            </div>
          )}

          {isSignup && (
            <label>
              Full name

              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email address

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {isCoordinator && (
            <>
              <label>
                Phone number <span className="auth-optional">(optional)</span>

                <input
                  type="tel"
                  placeholder="So the admin can verify you"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                />
              </label>

              <label>
                Your college

                <select
                  value={collegeChoice}
                  onChange={(event) => setCollegeChoice(event.target.value)}
                  required
                >
                  <option value="">
                    {collegesLoading ? 'Loading colleges…' : 'Select your college'}
                  </option>

                  {colleges.map((college) => (
                    <option key={college.id} value={college.id}>
                      {college.name}
                      {college.city ? ` – ${college.city}` : ''}
                    </option>
                  ))}

                  <option value="__other__">My college is not listed</option>
                </select>
              </label>

              {collegeNotListed && (
                <>
                  <label>
                    College name

                    <input
                      type="text"
                      placeholder="Full name of your college"
                      value={newCollegeName}
                      onChange={(event) => setNewCollegeName(event.target.value)}
                      required
                    />
                  </label>

                  <label>
                    City

                    <input
                      type="text"
                      placeholder="City"
                      value={newCollegeCity}
                      onChange={(event) => setNewCollegeCity(event.target.value)}
                    />
                  </label>
                </>
              )}

              <p className="auth-note">
                Coordinator accounts are reviewed by an administrator before
                you can edit your college. Each college has exactly one
                coordinator.
              </p>
            </>
          )}

          <label>
            Password

            <input
              type="password"
              placeholder={
                isSignup
                  ? 'At least 8 characters'
                  : 'Enter your password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? 8 : undefined}
              required
            />
          </label>

          {!isSignup && (
            <button
              type="button"
              className="reset-password"
              onClick={handlePasswordReset}
              disabled={loading}
            >
              Forgot password?
            </button>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-success" role="status">
              {message}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : isSignup
                ? accountType === 'coordinator'
                  ? 'Request coordinator account'
                  : 'Create account'
                : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup
            ? 'Already have an account?'
            : "Don't have an account?"}{' '}

          <button type="button" onClick={switchMode}>
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </section>
    </div>
  )
}