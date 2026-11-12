
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { CollegeLogo } from './CollegeVisual'
import './CollegeComparison.css'

const MAX_COLLEGES = 3

function asText(value) {
  return value == null || value === '' ? 'Not provided' : String(value)
}

function formatMoney(value) {
  if (value == null || value === '') return 'Not provided'

  const amount = Number(value)

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Not provided'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatLpa(value) {
  if (value == null || value === '') return 'Not provided'

  const amount = Number(value)

  return Number.isFinite(amount) && amount > 0
    ? `₹${amount.toFixed(1)} LPA`
    : 'Not provided'
}

function getPrograms(college) {
  const programs = college?.college_programs

  if (Array.isArray(programs)) return programs
  return programs ? [programs] : []
}

function getLowestFee(college) {
  const directFee = Number(college?.annual_fee ?? college?.tuition_fee_annual)
  if (Number.isFinite(directFee) && directFee > 0) return directFee

  const fees = getPrograms(college)
    .map((program) => Number(program.annual_fee))
    .filter((fee) => Number.isFinite(fee) && fee > 0)

  return fees.length ? Math.min(...fees) : null
}

function getUniqueValues(values) {
  return [...new Set(values.filter(Boolean))]
}

function getBranches(college) {
  return getUniqueValues(
    getPrograms(college).map((program) => program.branch),
  )
}

function getExams(college) {
  return getUniqueValues(
    getPrograms(college).map((program) => program.exam),
  )
}

function getAdmissionDetails(college) {
  const programs = getPrograms(college)

  if (!programs.length) {
    return 'No programme details available'
  }

  return programs.map((program, index) => {
    const details = [
      program.branch || 'Branch not provided',
      `Exam: ${asText(program.exam)}`,
      `Category: ${asText(program.category)}`,
      `Annual fee: ${formatMoney(program.annual_fee)}`,
      `Cutoff rank: ${asText(program.cutoff_rank)}`,
      `Cutoff year: ${asText(program.cutoff_year)}`,
      `Cutoff round: ${asText(program.cutoff_round)}`,
    ]

    return (
      <div
        className="ccmp-program"
        key={
          program.id ||
          `${program.branch}-${program.exam}-${program.category}-${index}`
        }
      >
        <strong>{program.branch || 'Branch not specified'}</strong>

        <div className="ccmp-program-details">
          {details.slice(1).map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </div>

        {program.cutoff_source_url && (
          <a
            href={program.cutoff_source_url}
            target="_blank"
            rel="noreferrer"
          >
            View cutoff source ↗
          </a>
        )}
      </div>
    )
  })
}

function ComparisonValue({ value }) {
  return (
    <span className={value === 'Not provided' ? 'ccmp-missing' : ''}>
      {value}
    </span>
  )
}

export default function CollegeComparison() {
  const [colleges, setColleges] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('All cities')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true

    async function loadColleges() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('colleges')
        .select('*, college_programs(*)')
        .eq('is_published', true)
        .order('name', { ascending: true })
        .limit(500)

      if (!active) return

      if (error) {
        console.error('Unable to load colleges for comparison:', error)
        setLoadError(
          'College data could not be loaded. Check your Supabase tables, relationship, and Row Level Security policies.',
        )
        setColleges([])
      } else {
        setColleges(data ?? [])
      }

      setLoading(false)
    }

    loadColleges()

    return () => {
      active = false
    }
  }, [])

  const cities = useMemo(() => {
    return [
      'All cities',
      ...getUniqueValues(
        colleges.map((college) => String(college.city ?? '').trim()),
      ).sort((a, b) => a.localeCompare(b)),
    ]
  }, [colleges])

  const filteredColleges = useMemo(() => {
    const query = search.trim().toLowerCase()

    return colleges.filter((college) => {
      const matchesCity =
        cityFilter === 'All cities' || college.city === cityFilter

      const searchableText = [
        college.name,
        college.city,
        college.state,
        college.institution_type,
        ...getBranches(college),
        ...getExams(college),
      ]
        .map((value) => String(value ?? ''))
        .join(' ')
        .toLowerCase()

      return matchesCity && (!query || searchableText.includes(query))
    })
  }, [colleges, search, cityFilter])

  const selectedColleges = useMemo(() => {
    return selectedIds
      .map((id) => colleges.find((college) => String(college.id) === id))
      .filter(Boolean)
  }, [colleges, selectedIds])

  function toggleCollege(college) {
    const id = String(college.id)

    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((selectedId) => selectedId !== id)
      }

      if (current.length >= MAX_COLLEGES) {
        return current
      }

      return [...current, id]
    })
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function renderBranches(college) {
    const branches = getBranches(college)
    return branches.length ? branches.join(', ') : 'Not provided'
  }

  function renderExams(college) {
    const exams = getExams(college)
    return exams.length ? exams.join(', ') : 'Not provided'
  }

  function renderRecruiters(college) {
    const recruiters = Array.isArray(college.top_recruiters)
      ? college.top_recruiters.filter(Boolean)
      : []

    return recruiters.length ? recruiters.join(', ') : 'Not provided'
  }

  function renderHostel(college) {
    if (college.hostel_available == null) return 'Not provided'

    return college.hostel_available ? 'Available' : 'Not available'
  }

  function renderPlacementRate(college) {
    if (
      college.placement_rate == null ||
      !Number.isFinite(Number(college.placement_rate))
    ) {
      return 'Not provided'
    }

    return `${college.placement_rate}%`
  }

  const comparisonRows = [
    {
      label: 'City',
      getValue: (college) =>
        [college.city, college.state].filter(Boolean).join(', ') ||
        'Not provided',
    },
    {
      label: 'Institution type',
      getValue: (college) =>
        college.institution_type
          ? String(college.institution_type).replaceAll('_', ' ')
          : 'Not provided',
    },
    {
      label: 'Established year',
      getValue: (college) => asText(college.established_year),
    },
    {
      label: 'Campus area',
      getValue: (college) =>
        college.campus_area_acres != null
          ? `${college.campus_area_acres} acres`
          : 'Not provided',
    },
    {
      label: 'Available branches',
      getValue: renderBranches,
    },
    {
      label: 'Entrance exams',
      getValue: renderExams,
    },
    {
      label: 'Annual fee',
      getValue: (college) => formatMoney(getLowestFee(college)),
    },
    {
      label: 'Average package',
      getValue: (college) => formatLpa(college.avg_package_lpa),
    },
    {
      label: 'Highest package',
      getValue: (college) => formatLpa(college.highest_package_lpa),
    },
    {
      label: 'Placement rate',
      getValue: renderPlacementRate,
    },
    {
      label: 'Hostel',
      getValue: renderHostel,
    },
    {
      label: 'Hostel details',
      getValue: (college) => asText(college.hostel_details),
    },
    {
      label: 'Top recruiters',
      getValue: renderRecruiters,
    },
  ]

  return (
    <section className="ccmp-page">
      <header className="ccmp-hero">
        <div>
          <span className="ccmp-eyebrow">MAKE AN INFORMED DECISION</span>
          <h1>College comparison</h1>
          <p>
            Compare up to three colleges side by side to understand their
            available programmes, fees, placements, and campus information.
          </p>
        </div>

        <div className="ccmp-hero-icon" aria-hidden="true">
          ⚖️
        </div>
      </header>

      <div className="ccmp-summary">
        <div className="ccmp-summary-card">
          <span>🏛️</span>
          <div>
            <strong>{loading ? '—' : colleges.length}</strong>
            <small>Published colleges</small>
          </div>
        </div>

        <div className="ccmp-summary-card">
          <span>✓</span>
          <div>
            <strong>{selectedIds.length}/{MAX_COLLEGES}</strong>
            <small>Colleges selected</small>
          </div>
        </div>

        <div className="ccmp-summary-card">
          <span>📊</span>
          <div>
            <strong>{selectedColleges.length}</strong>
            <small>Ready to compare</small>
          </div>
        </div>
      </div>

      <section className="ccmp-picker">
        <div className="ccmp-section-heading">
          <div>
            <h2>Choose colleges</h2>
            <p>Select at least two colleges for a side-by-side comparison.</p>
          </div>

          <button
            type="button"
            className="ccmp-clear-button"
            onClick={clearSelection}
            disabled={!selectedIds.length}
          >
            Clear selection
          </button>
        </div>

        <div className="ccmp-controls">
          <label className="ccmp-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by college, city, branch, or exam..."
              aria-label="Search colleges to compare"
            />
          </label>

          <label className="ccmp-city-filter">
            <span>City</span>
            <select
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loadError && (
          <div className="ccmp-error" role="alert">
            <strong>Unable to load colleges</strong>
            <p>{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="ccmp-state">
            <span className="ccmp-spinner" />
            <p>Loading colleges…</p>
          </div>
        ) : !loadError && filteredColleges.length === 0 ? (
          <div className="ccmp-state">
            <h3>No colleges found</h3>
            <p>Try a different search term or city.</p>
          </div>
        ) : !loadError ? (
          <>
            <div className="ccmp-picker-status">
              <span>
                Showing {filteredColleges.length} colleges
              </span>
              <span>
                {selectedIds.length >= MAX_COLLEGES
                  ? 'Maximum of 3 colleges selected'
                  : `You can select ${MAX_COLLEGES - selectedIds.length} more`}
              </span>
            </div>

            <div className="ccmp-college-grid">
              {filteredColleges.map((college) => {
                const id = String(college.id)
                const selected = selectedIds.includes(id)
                const limitReached =
                  selectedIds.length >= MAX_COLLEGES && !selected

                return (
                  <article
                    key={college.id}
                    className={`ccmp-college-card ${selected ? 'is-selected' : ''
                      }`}
                  >
                    <div className="ccmp-card-top">
                      <CollegeLogo college={college} size={52} />
                      <span className="ccmp-type">
                        {String(college.institution_type || 'College')
                          .replaceAll('_', ' ')}
                      </span>
                    </div>

                    <h3>{college.name || 'Unnamed college'}</h3>

                    <p className="ccmp-location">
                      📍{' '}
                      {[college.city, college.state]
                        .filter(Boolean)
                        .join(', ') || 'Location not provided'}
                    </p>

                    <div className="ccmp-mini-stats">
                      <div>
                        <span>Annual fee</span>
                        <strong>
                          {formatMoney(getLowestFee(college))}
                        </strong>
                      </div>

                      <div>
                        <span>Average package</span>
                        <strong>
                          {formatLpa(college.avg_package_lpa)}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`ccmp-select-button ${selected ? 'selected' : ''
                        }`}
                      onClick={() => toggleCollege(college)}
                      disabled={limitReached}
                      aria-pressed={selected}
                    >
                      {selected
                        ? '✓ Selected — Remove'
                        : limitReached
                          ? 'Maximum reached'
                          : '+ Add to comparison'}
                    </button>
                  </article>
                )
              })}
            </div>
          </>
        ) : null}
      </section>

      <section className="ccmp-results">
        <div className="ccmp-section-heading">
          <div>
            <h2>Your comparison</h2>
            <p>
              Review the same information for every selected college.
            </p>
          </div>
        </div>

        {selectedColleges.length < 2 ? (
          <div className="ccmp-empty">
            <span aria-hidden="true">📊</span>
            <h3>Select two or three colleges</h3>
            <p>
              Add at least two colleges above. Their available details will
              appear together here.
            </p>
          </div>
        ) : (
          <>
            <div className="ccmp-table-wrap">
              <table className="ccmp-table">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>

                    {selectedColleges.map((college) => (
                      <th scope="col" key={college.id}>
                        <div className="ccmp-table-college">
                          <CollegeLogo college={college} size={40} />
                          <strong>{college.name}</strong>
                          <button
                            type="button"
                            onClick={() => toggleCollege(college)}
                            aria-label={`Remove ${college.name} from comparison`}
                          >
                            Remove ×
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>

                      {selectedColleges.map((college) => {
                        const value = row.getValue(college)

                        return (
                          <td key={college.id}>
                            <ComparisonValue value={value} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  <tr className="ccmp-admissions-row">
                    <th scope="row">Programme & admission details</th>

                    {selectedColleges.map((college) => (
                      <td key={college.id}>
                        <div className="ccmp-admission-cell">
                          {getAdmissionDetails(college)}
                        </div>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <th scope="row">Official website</th>

                    {selectedColleges.map((college) => (
                      <td key={college.id}>
                        {college.website ? (
                          <a
                            className="ccmp-website"
                            href={college.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Visit website ↗
                          </a>
                        ) : (
                          <ComparisonValue value="Not provided" />
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="ccmp-note">
              <strong>Important:</strong> Fees, placement figures, and cutoff
              details are shown only when they exist in your database. Missing
              values are not estimates. The annual fee is the official college annual fee or minimum
              valid programme fee recorded for each college; it may not apply
              to every branch or admission category.
            </div>
          </>
        )}
      </section>
    </section>
  )
}
