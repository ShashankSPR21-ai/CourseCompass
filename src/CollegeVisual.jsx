import { useState } from 'react'
import './CollegeVisual.css'

function initials(name) {
  return String(name || 'C')
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || 'C'
}

// The logo the coordinator uploaded (falls back to the college's initials).
export function CollegeLogo({ college, size = 52, className = '' }) {
  const [failed, setFailed] = useState(false)
  const url = college?.logo_url

  return (
    <span
      className={`cv-logo ${className}`}
      style={{ '--cv-size': `${size}px` }}
      title={college?.name || undefined}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={`${college?.name || 'College'} logo`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <b aria-hidden="true">{initials(college?.name)}</b>
      )}
    </span>
  )
}

// The wide campus photo the coordinator uploaded, fitted to the card.
export function CollegeCover({ college, className = '', children }) {
  const [failed, setFailed] = useState(false)
  const url = college?.cover_url

  return (
    <div className={`cv-cover ${url && !failed ? '' : 'cv-cover-empty'} ${className}`}>
      {url && !failed && (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
      <span className="cv-cover-shade" aria-hidden="true" />
      {children}
    </div>
  )
}
