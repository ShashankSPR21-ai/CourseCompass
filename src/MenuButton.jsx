import './MenuButton.css'

// The "hamburger" that opens / closes the sidebar drawer.
export default function MenuButton({ open, onClick, label = 'Menu' }) {
  return (
    <button
      type="button"
      className={`cc-menu-btn${open ? ' is-open' : ''}`}
      onClick={onClick}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-haspopup="true"
    >
      <span className="cc-menu-icon" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="cc-menu-text">{label}</span>
    </button>
  )
}
