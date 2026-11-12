import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { CollegeCover, CollegeLogo } from './CollegeVisual'
import './SavedColleges.css'

const STORAGE_KEY = 'coursecompass_saved_colleges'

function getSavedIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved.map(String) : []
  } catch {
    return []
  }
}

function getPrograms(college) {
  const programs = college.college_programs
  if (Array.isArray(programs)) return programs
  return programs ? [programs] : []
}

function formatPackage(value) {
  if (value == null || value === '') return 'Not provided'
  return `₹${Number(value).toFixed(1)} LPA`
}

export default function SavedColleges() {
  const [colleges, setColleges] = useState([])
  const [savedIds, setSavedIds] = useState(getSavedIds)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true

    async function loadColleges() {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('colleges')
        .select('*, college_programs(*)')
        .eq('is_published', true)
        .order('name', { ascending: true })
        .limit(500)

      if (!active) return

      if (queryError) {
        setError(queryError.message)
        setColleges([])
      } else {
        setColleges(data || [])
      }

      setLoading(false)
    }

    loadColleges()

    return () => {
      active = false
    }
  }, [])

  function removeSaved(id) {
    const updated = savedIds.filter(savedId => savedId !== String(id))

    setSavedIds(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const savedColleges = colleges.filter(college =>
    savedIds.includes(String(college.id))
  )

  const filteredColleges = savedColleges.filter(college => {
    const searchText = search.toLowerCase().trim()

    return (
      !searchText ||
      String(college.name || '').toLowerCase().includes(searchText) ||
      String(college.city || '').toLowerCase().includes(searchText) ||
      String(college.state || '').toLowerCase().includes(searchText)
    )
  })

  return (
    <section className="sc-page">
      <div className="sc-header">
        <div>
          <span className="sc-eyebrow">YOUR PERSONAL SHORTLIST</span>
          <h1>Saved Colleges ⭐</h1>
          <p>Keep your favourite colleges together while planning your admission.</p>
        </div>

        <div className="sc-count">
          <strong>{savedColleges.length}</strong>
          <span>Saved colleges</span>
        </div>
      </div>

      <div className="sc-toolbar">
        <input
          type="search"
          placeholder="Search saved colleges by name or city..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          aria-label="Search saved colleges"
        />
      </div>

      {loading && (
        <div className="sc-state">
          <div className="sc-spinner" />
          <p>Loading your saved colleges...</p>
        </div>
      )}

      {!loading && error && (
        <div className="sc-state sc-error">
          <h3>Unable to load colleges</h3>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && savedColleges.length === 0 && (
        <div className="sc-empty">
          <div className="sc-empty-icon">♡</div>
          <h2>Your wishlist is empty</h2>
          <p>
            Open College Finder and save colleges you want to explore.
            They will appear here on this browser.
          </p>
        </div>
      )}

      {!loading && !error && savedColleges.length > 0 &&
        filteredColleges.length === 0 && (
          <div className="sc-empty">
            <h2>No matching colleges</h2>
            <p>Try a different college name or city.</p>
          </div>
        )}

      {!loading && !error && filteredColleges.length > 0 && (
        <div className="sc-grid">
          {filteredColleges.map(college => {
            const programs = getPrograms(college)
            const branches = [
              ...new Set(
                programs
                  .map(program => program.branch)
                  .filter(Boolean)
              )
            ]

            return (
              <article className="sc-card" key={college.id}>
                <div className="cv-banner">
                  <CollegeCover college={college} />
                  <CollegeLogo college={college} size={60} />

                  <button
                    type="button"
                    className="sc-remove cv-remove"
                    onClick={() => removeSaved(college.id)}
                    aria-label={`Remove ${college.name} from wishlist`}
                    title="Remove from wishlist"
                  >
                    ♥
                  </button>
                </div>

                <h2>{college.name}</h2>

                <p className="sc-location">
                  📍 {[college.city, college.state]
                    .filter(Boolean)
                    .join(', ') || 'Location not provided'}
                </p>

                <div className="sc-stats">
                  <div>
                    <span>Average package</span>
                    <strong>{formatPackage(college.avg_package_lpa)}</strong>
                  </div>

                  <div>
                    <span>Highest package</span>
                    <strong>{formatPackage(college.highest_package_lpa)}</strong>
                  </div>
                </div>

                <div className="sc-branches">
                  <span className="sc-label">Available branches</span>
                  {branches.length > 0 ? (
                    <div className="sc-tags">
                      {branches.slice(0, 4).map(branch => (
                        <span key={branch}>{branch}</span>
                      ))}
                      {branches.length > 4 && (
                        <span>+{branches.length - 4} more</span>
                      )}
                    </div>
                  ) : (
                    <p>Branch details not provided</p>
                  )}
                </div>

                <div className="sc-card-actions">
                  {college.website && (
                    <a
                      href={college.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sc-website"
                    >
                      Official website ↗
                    </a>
                  )}

                  <button
                    type="button"
                    className="sc-remove-button"
                    onClick={() => removeSaved(college.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}