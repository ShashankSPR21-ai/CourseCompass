
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './CutoffComparison.css'

const ALL = 'All'

const formatMoney = (value) => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) {
    return 'Not provided'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

const formatRank = (value) =>
  value == null ? 'Not provided' : Number(value).toLocaleString('en-IN')

export default function CutoffComparison() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exam, setExam] = useState(ALL)
  const [branch, setBranch] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [year, setYear] = useState(ALL)
  const [round, setRound] = useState(ALL)
  const [rankInput, setRankInput] = useState('')
  const [selected, setSelected] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function loadCutoffs() {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('college_programs')
        .select(`
          id,
          college_id,
          branch,
          exam,
          category,
          annual_fee,
          cutoff_rank,
          cutoff_year,
          cutoff_round,
          cutoff_source_url,
          colleges!inner (
            id,
            name,
            city,
            website,
            is_published
          )
        `)
        .eq('colleges.is_published', true)
        .order('cutoff_year', { ascending: false })
        .limit(2000)

      if (!active) return

      if (queryError) {
        console.error('Unable to load cutoffs:', queryError)
        setError(
          'Unable to load cutoff records. Please check your Supabase connection, college relationship, and database read permissions.',
        )
        setRecords([])
      } else {
        const normalized = (data ?? [])
          .map((item) => ({
            ...item,
            college: Array.isArray(item.colleges)
              ? item.colleges[0]
              : item.colleges,
          }))
          .filter((item) => item.college)

        setRecords(normalized)
      }

      setLoading(false)
    }

    loadCutoffs()

    // Pick up cutoffs the admin approved while this page was open.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setReloadKey((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reloadKey])

  const exams = useMemo(
    () => [ALL, ...new Set(records.map((r) => r.exam).filter(Boolean))],
    [records],
  )

  const branches = useMemo(
    () => [
      ALL,
      ...new Set(
        records
          .filter((r) => exam === ALL || r.exam === exam)
          .map((r) => r.branch)
          .filter(Boolean),
      ),
    ],
    [records, exam],
  )

  const categories = useMemo(
    () => [
      ALL,
      ...new Set(
        records
          .filter((r) => exam === ALL || r.exam === exam)
          .filter((r) => branch === ALL || r.branch === branch)
          .map((r) => r.category)
          .filter(Boolean),
      ),
    ],
    [records, exam, branch],
  )

  const years = useMemo(
    () => [
      ALL,
      ...new Set(
        records
          .filter((r) => exam === ALL || r.exam === exam)
          .filter((r) => branch === ALL || r.branch === branch)
          .filter((r) => category === ALL || r.category === category)
          .map((r) => r.cutoff_year)
          .filter((v) => v != null),
      ),
    ],
    [records, exam, branch, category],
  )

  const rounds = useMemo(
    () => [
      ALL,
      ...new Set(
        records
          .filter((r) => exam === ALL || r.exam === exam)
          .filter((r) => branch === ALL || r.branch === branch)
          .filter((r) => category === ALL || r.category === category)
          .filter((r) => year === ALL || String(r.cutoff_year) === String(year))
          .map((r) => r.cutoff_round)
          .filter(Boolean),
      ),
    ],
    [records, exam, branch, category, year],
  )

  const results = useMemo(
    () =>
      records
        .filter((r) => exam === ALL || r.exam === exam)
        .filter((r) => branch === ALL || r.branch === branch)
        .filter((r) => category === ALL || r.category === category)
        .filter((r) => year === ALL || String(r.cutoff_year) === String(year))
        .filter((r) => round === ALL || r.cutoff_round === round)
        .sort((a, b) => {
          const rankA = a.cutoff_rank == null ? Infinity : Number(a.cutoff_rank)
          const rankB = b.cutoff_rank == null ? Infinity : Number(b.cutoff_rank)
          return rankA - rankB
        }),
    [records, exam, branch, category, year, round],
  )

  const userRank = Number(rankInput)
  const hasValidRank =
    rankInput.trim() !== '' &&
    Number.isSafeInteger(userRank) &&
    userRank > 0

  const comparison = results.filter((r) => selected.includes(r.id))

  function resetFilters() {
    setExam(ALL)
    setBranch(ALL)
    setCategory(ALL)
    setYear(ALL)
    setRound(ALL)
    setRankInput('')
    setSelected([])
  }

  function toggleCompare(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    )
  }

  return (
    <section className="ccut-page">
      <div className="ccut-refresh-row">
        <button
          type="button"
          className="ccut-refresh"
          onClick={() => setReloadKey((n) => n + 1)}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : '↻ Refresh cutoffs'}
        </button>
      </div>

      <header className="ccut-hero">
        <div className="ccut-hero-content">
          <div className="ccut-eyebrow">
            <span className="ccut-eyebrow-dot" />
            SMART ADMISSION PLANNER
          </div>

          <h1>
            Find your college.
            <br />
            <span>Compare your possibilities.</span>
          </h1>

          <p>
            Explore historical KCET and COMEDK closing ranks, compare
            programmes, and shortlist colleges using your entrance rank.
          </p>

          <div className="ccut-hero-points">
            <span><b>✓</b> Historical cutoff data</span>
            <span><b>✓</b> College comparisons</span>
            <span><b>✓</b> Fee information</span>
          </div>
        </div>

        <div className="ccut-hero-art" aria-hidden="true">
          <div className="ccut-art-circle ccut-art-circle-one" />
          <div className="ccut-art-circle ccut-art-circle-two" />
          <div className="ccut-art-card">
            <div className="ccut-art-card-top">
              <span>ADMISSION INSIGHTS</span>
              <span className="ccut-art-spark">✦</span>
            </div>
            <div className="ccut-art-icon">🎓</div>
            <strong>Make informed choices</strong>
            <p>Compare ranks. Explore options.</p>
            <div className="ccut-art-bars">
              <i /><i /><i /><i /><i />
            </div>
          </div>
        </div>
      </header>

      <div className="ccut-stat-grid">
        <article className="ccut-stat-card">
          <span className="ccut-stat-icon purple">▤</span>
          <div>
            <span className="ccut-stat-label">Matching records</span>
            <strong>{loading ? '—' : results.length}</strong>
            <small>Based on your filters</small>
          </div>
        </article>

        <article className="ccut-stat-card">
          <span className="ccut-stat-icon blue">⌕</span>
          <div>
            <span className="ccut-stat-label">Entrance exam</span>
            <strong className="ccut-stat-text">{exam}</strong>
            <small>Selected examination</small>
          </div>
        </article>

        <article className="ccut-stat-card">
          <span className="ccut-stat-icon green">⇄</span>
          <div>
            <span className="ccut-stat-label">Compare shortlist</span>
            <strong>{selected.length}<span className="ccut-stat-total"> / 4</span></strong>
            <small>Selected programmes</small>
          </div>
        </article>
      </div>

      <section className="ccut-panel">
        <div className="ccut-section-heading">
          <div>
            <span className="ccut-section-kicker">STEP 01</span>
            <h2>Find matching cutoffs</h2>
            <p>Use the filters to narrow down your admission options.</p>
          </div>
          <button className="ccut-reset-btn" type="button" onClick={resetFilters}>
            ↺ Reset filters
          </button>
        </div>

        <div className="ccut-filter-grid">
          <label className="ccut-field">
            <span>Entrance exam</span>
            <select
              value={exam}
              onChange={(e) => {
                setExam(e.target.value)
                setBranch(ALL)
                setCategory(ALL)
                setYear(ALL)
                setRound(ALL)
                setSelected([])
              }}
            >
              {exams.map((v) => <option key={v} value={v}>{v === ALL ? 'All exams' : v}</option>)}
            </select>
          </label>

          <label className="ccut-field">
            <span>Engineering branch</span>
            <select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value)
                setCategory(ALL)
                setYear(ALL)
                setRound(ALL)
                setSelected([])
              }}
            >
              {branches.map((v) => <option key={v} value={v}>{v === ALL ? 'All branches' : v}</option>)}
            </select>
          </label>

          <label className="ccut-field">
            <span>Admission category</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setYear(ALL)
                setRound(ALL)
                setSelected([])
              }}
            >
              {categories.map((v) => <option key={v} value={v}>{v === ALL ? 'All categories' : v}</option>)}
            </select>
          </label>

          <label className="ccut-field">
            <span>Cutoff year</span>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value)
                setRound(ALL)
                setSelected([])
              }}
            >
              {years.map((v) => <option key={v} value={v}>{v === ALL ? 'All years' : v}</option>)}
            </select>
          </label>

          <label className="ccut-field">
            <span>Admission round</span>
            <select
              value={round}
              onChange={(e) => {
                setRound(e.target.value)
                setSelected([])
              }}
            >
              {rounds.map((v) => <option key={v} value={v}>{v === ALL ? 'All rounds' : v}</option>)}
            </select>
          </label>
        </div>

        <div className="ccut-filter-bottom">
          <span className="ccut-live-dot" />
          {loading ? 'Loading admission records…' : `${results.length} matching records`}
        </div>
      </section>

      <section className="ccut-rank-panel">
        <div className="ccut-rank-icon">⌁</div>
        <div className="ccut-rank-copy">
          <span className="ccut-section-kicker">PERSONALISE YOUR SEARCH</span>
          <h2>Check options against your rank</h2>
          <p>
            Enter your entrance-exam rank to compare it with recorded closing
            ranks. This is a historical guide, not an admission guarantee.
          </p>
        </div>
        <label className="ccut-rank-input">
          <span>Your entrance rank</span>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 25000"
            value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
          />
          <small>{hasValidRank ? `Rank entered: ${formatRank(userRank)}` : 'Enter a positive whole number'}</small>
        </label>
      </section>

      {error && <div className="ccut-alert" role="alert">⚠ {error}</div>}

      <section className="ccut-panel ccut-results-panel">
        <div className="ccut-section-heading ccut-results-heading">
          <div>
            <span className="ccut-section-kicker">STEP 02</span>
            <h2>Admission cutoff results</h2>
            <p>Sorted by closing rank, from lowest to highest.</p>
          </div>
          <span className="ccut-results-count">{loading ? 'Loading…' : `${results.length} results`}</span>
        </div>

        {loading ? (
          <div className="ccut-loading">
            <span className="ccut-spinner" />
            <p>Loading cutoff records…</p>
          </div>
        ) : error ? (
          <div className="ccut-empty-state">
            <span className="ccut-empty-icon">!</span>
            <h3>We couldn't load the records</h3>
            <p>Check your Supabase settings and database permissions, then refresh the page.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="ccut-empty-state">
            <span className="ccut-empty-icon">⌕</span>
            <h3>No matching cutoff records</h3>
            <p>Try changing your filters, or add verified cutoff records in Supabase.</p>
            <button className="ccut-reset-btn" onClick={resetFilters}>Clear all filters</button>
          </div>
        ) : (
          <div className="ccut-table-wrap">
            <table className="ccut-table">
              <thead>
                <tr>
                  <th>Compare</th>
                  <th>College & location</th>
                  <th>Branch</th>
                  <th>Exam / category</th>
                  <th>Year / round</th>
                  <th>Closing rank</th>
                  <th>Annual fee</th>
                  <th>Sources</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const rank = r.cutoff_rank == null ? null : Number(r.cutoff_rank)
                  const rankRelation = hasValidRank && rank != null
                    ? rank >= userRank
                      ? 'Within historical range'
                      : 'More competitive'
                    : ''

                  return (
                    <tr key={r.id} className={selected.includes(r.id) ? 'ccut-row-selected' : ''}>
                      <td>
                        <input
                          className="ccut-checkbox"
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => toggleCompare(r.id)}
                          disabled={!selected.includes(r.id) && selected.length >= 4}
                          aria-label={`Compare ${r.college.name}, ${r.branch}`}
                        />
                      </td>
                      <td>
                        <div className="ccut-college-name">{r.college.name}</div>
                        <div className="ccut-muted">{r.college.city || 'Location not provided'}</div>
                      </td>
                      <td>{r.branch || 'Not provided'}</td>
                      <td>
                        <span className="ccut-exam-tag">{r.exam || 'Not provided'}</span>
                        <div className="ccut-muted">{r.category || 'Category not provided'}</div>
                      </td>
                      <td>
                        <strong>{r.cutoff_year || '—'}</strong>
                        <div className="ccut-muted">{r.cutoff_round || 'Round not provided'}</div>
                      </td>
                      <td>
                        {rank == null ? (
                          <span className="ccut-muted">Not provided</span>
                        ) : (
                          <>
                            <strong className="ccut-rank-number">{formatRank(rank)}</strong>
                            {rankRelation && (
                              <span className={`ccut-rank-badge ${rank >= userRank ? 'ccut-rank-good' : 'ccut-rank-caution'}`}>
                                {rankRelation}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="ccut-fee">{formatMoney(r.annual_fee)}</td>
                      <td>
                        <div className="ccut-source-links">
                          {r.cutoff_source_url ? (
                            <a href={r.cutoff_source_url} target="_blank" rel="noreferrer">Cutoff source ↗</a>
                          ) : (
                            <span className="ccut-muted">No cutoff source</span>
                          )}
                          {r.college.website && (
                            <a href={r.college.website} target="_blank" rel="noreferrer">College website ↗</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="ccut-table-footer">
            <span>Select up to four programmes to compare them below.</span>
            <span>{selected.length} of 4 selected</span>
          </div>
        )}
      </section>

      <section className="ccut-panel ccut-compare-panel">
        <div className="ccut-section-heading">
          <div>
            <span className="ccut-section-kicker">STEP 03</span>
            <h2>Compare selected programmes</h2>
            <p>Review key differences side by side before making a shortlist.</p>
          </div>
          {comparison.length > 0 && (
            <button className="ccut-reset-btn" onClick={() => setSelected([])}>
              Clear selection
            </button>
          )}
        </div>

        {comparison.length === 0 ? (
          <div className="ccut-compare-empty">
            <span>⇄</span>
            <strong>Your comparison starts here</strong>
            <p>Select programmes from the results table above to compare them side by side.</p>
          </div>
        ) : (
          <div className="ccut-table-wrap">
            <table className="ccut-table ccut-compare-table">
              <thead>
                <tr>
                  <th>Programme detail</th>
                  {comparison.map((r) => (
                    <th key={r.id}>
                      <div>{r.college.name}</div>
                      <small>{r.college.city || 'Location not provided'}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Branch', (r) => r.branch || 'Not provided'],
                  ['Entrance exam', (r) => r.exam || 'Not provided'],
                  ['Category', (r) => r.category || 'Not provided'],
                  ['Cutoff year', (r) => r.cutoff_year ?? 'Not provided'],
                  ['Admission round', (r) => r.cutoff_round || 'Not provided'],
                  ['Closing rank', (r) => formatRank(r.cutoff_rank)],
                  ['Annual fee', (r) => formatMoney(r.annual_fee)],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {comparison.map((r) => (
                      <td key={r.id}>{value(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="ccut-disclaimer">
        <span>ⓘ</span>
        <p>
          <strong>Important:</strong> Cutoff ranks are historical closing ranks,
          not guaranteed admission outcomes. Data availability depends on
          published records. Confirm current-year cutoffs and eligibility with
          the official counselling authority before making admission decisions.
        </p>
      </div>
    </section>
  )
}
