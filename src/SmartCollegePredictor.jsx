import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { CollegeLogo } from './CollegeVisual'
import './SmartCollegePredictor.css'

const BRANCHES = [
  'Computer Science',
  'Artificial Intelligence',
  'Data Science',
  'Cyber Security',
  'Information Technology',
  'Electronics & Communication',
  'Internet of Things',
]

const CITIES = ['Any city', 'Bengaluru', 'Mysuru', 'Mangaluru', 'Other']

const formatFee = (fee) => {
  if (fee === null || fee === undefined) return 'Fee not available'

  return `₹${Number(fee).toLocaleString('en-IN')} / year`
}

function SmartCollegePredictor() {
  const [exam, setExam] = useState('KCET')
  const [rank, setRank] = useState('')
  const [category, setCategory] = useState('GM')
  const [city, setCity] = useState('Bengaluru')
  const [branch, setBranch] = useState('Computer Science')
  const [budget, setBudget] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function findColleges(event) {
    event.preventDefault()
    setError('')
    setResults([])
    setSearched(false)

    if (!rank || Number(rank) <= 0 || !Number.isFinite(Number(rank))) {
      setError('Enter a valid positive entrance exam rank.')
      return
    }

    if (budget && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
      setError('Enter a valid annual fee budget.')
      return
    }

    setLoading(true)

    try {
      let query = supabase
        .from('college_programs')
        .select(`
          id,
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
            state,
            slug,
            logo_url
          )
        `)
        .eq('exam', exam)
        .limit(500)

      const { data, error: queryError } = await query

      if (queryError) {
        throw new Error(queryError.message)
      }

      const normalized = (value) =>
        String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')

      const branchTerms = {
        'Computer Science': ['computerscience', 'cse', 'csengineering'],
        'Artificial Intelligence': ['artificialintelligence', 'aiml', 'aiandml'],
        'Data Science': ['datascience', 'ds'],
        'Cyber Security': ['cybersecurity', 'cybersecurityengineering'],
        'Information Technology': ['informationtechnology', 'itengineering'],
        'Electronics & Communication': [
          'electronicscommunication',
          'ece',
          'electronicsandcommunication',
        ],
        'Internet of Things': ['internetofthings', 'iot'],
      }

      const wantedBranches = branchTerms[branch] || [normalized(branch)]

      const filtered = (data || []).filter((program) => {
        const college = program.colleges || {}
        const programBranch = normalized(program.branch)
        const matchesBranch = wantedBranches.some(
          (term) => programBranch.includes(term) || term.includes(programBranch),
        )

        const matchesCity =
          city === 'Any city' ||
          (city === 'Other'
            ? !['bengaluru', 'mysuru', 'mangaluru'].includes(
                normalized(college.city),
              )
            : normalized(college.city).includes(normalized(city)))

        const matchesCategory =
          !program.category ||
          normalized(program.category) === normalized(category)

        const matchesBudget =
          !budget ||
          program.annual_fee === null ||
          Number(program.annual_fee) <= Number(budget)

        return (
          matchesBranch &&
          matchesCity &&
          matchesCategory &&
          matchesBudget
        )
      })

      const sorted = filtered.sort((a, b) => {
        const aRank = a.cutoff_rank
        const bRank = b.cutoff_rank

        if (aRank === null && bRank === null) return 0
        if (aRank === null) return 1
        if (bRank === null) return -1

        return Number(aRank) - Number(bRank)
      })

      setResults(sorted)
      setSearched(true)
    } catch (searchError) {
      setError(
        `Unable to search colleges: ${searchError.message}. Check your Supabase table and column names.`,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="scp-page">
      <div className="scp-hero">
        <span className="scp-eyebrow">PERSONALISED COLLEGE SEARCH</span>
        <h1>Smart College Predictor 🎓</h1>
        <p>
          Enter your entrance exam details and preferences to find colleges
          that may match your requirements.
        </p>
      </div>

      <form className="scp-form" onSubmit={findColleges}>
        <div className="scp-form-heading">
          <h2>Your admission preferences</h2>
          <p>Complete the details below to explore matching colleges.</p>
        </div>

        <div className="scp-fields">
          <label>
            Entrance exam
            <select value={exam} onChange={(e) => setExam(e.target.value)}>
              <option value="KCET">KCET</option>
              <option value="COMEDK">COMEDK</option>
            </select>
          </label>

          <label>
            Entrance exam rank
            <input
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 67000"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              required
            />
          </label>

          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="GM">General Merit (GM)</option>
              <option value="1">Category 1</option>
              <option value="2A">Category 2A</option>
              <option value="2B">Category 2B</option>
              <option value="3A">Category 3A</option>
              <option value="3B">Category 3B</option>
              <option value="SC">SC</option>
              <option value="ST">ST</option>
              <option value="OBC">OBC (if applicable in your dataset)</option>
            </select>
          </label>

          <label>
            Preferred city
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              {CITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Preferred branch
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {BRANCHES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Maximum annual fee (₹)
            <input
              type="number"
              min="0"
              placeholder="e.g. 150000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
        </div>

        <button className="scp-submit" type="submit" disabled={loading}>
          {loading ? 'Finding colleges…' : 'Find Matching Colleges →'}
        </button>

        {error && (
          <p className="scp-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {searched && (
        <section className="scp-results">
          <div className="scp-results-heading">
            <div>
              <span className="scp-eyebrow">YOUR SEARCH RESULTS</span>
              <h2>Matching colleges</h2>
              <p>
                {results.length} matching program
                {results.length === 1 ? '' : 's'} found in your database.
              </p>
            </div>
          </div>

          <div className="scp-notice">
            <strong>Important:</strong> These are preference matches, not
            confirmed admission predictions. Verified cutoff data is required
            to estimate admission chances using your rank and category.
          </div>

          {results.length > 0 ? (
            <div className="scp-results-grid">
              {results.map((program) => {
                const college = program.colleges || {}
                const hasCutoff =
                  program.cutoff_rank !== null &&
                  program.cutoff_rank !== undefined

                const rankCompatible =
                  hasCutoff && Number(rank) <= Number(program.cutoff_rank)

                return (
                  <article className="scp-college-card" key={program.id}>
                    <div className="scp-card-top">
                      <CollegeLogo college={college} size={52} />
                      <span className="scp-exam-badge">{program.exam}</span>
                    </div>

                    <h3>{college.name || 'College name unavailable'}</h3>

                    <p className="scp-location">
                      📍 {college.city || 'City unavailable'}
                      {college.state ? `, ${college.state}` : ''}
                    </p>

                    <div className="scp-detail-row">
                      <span>Branch</span>
                      <strong>{program.branch}</strong>
                    </div>

                    <div className="scp-detail-row">
                      <span>Annual fee</span>
                      <strong>{formatFee(program.annual_fee)}</strong>
                    </div>

                    <div className="scp-detail-row">
                      <span>Cutoff rank</span>
                      <strong>
                        {hasCutoff
                          ? Number(program.cutoff_rank).toLocaleString('en-IN')
                          : 'Not available'}
                      </strong>
                    </div>

                    <div className="scp-status">
                      {hasCutoff ? (
                        <span className={rankCompatible ? 'scp-possible' : 'scp-unlikely'}>
                          {rankCompatible
                            ? 'Your rank is within this recorded cutoff'
                            : 'Your rank is outside this recorded cutoff'}
                        </span>
                      ) : (
                        <span className="scp-unknown">
                          Admission chance unknown — cutoff data missing
                        </span>
                      )}
                    </div>

                    {program.cutoff_year && (
                      <small className="scp-cutoff-meta">
                        Cutoff year: {program.cutoff_year}
                        {program.cutoff_round
                          ? ` · Round ${program.cutoff_round}`
                          : ''}
                      </small>
                    )}

                    {program.cutoff_source_url && (
                      <a
                        className="scp-source-link"
                        href={program.cutoff_source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View cutoff source ↗
                      </a>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="scp-empty">
              <span>🔎</span>
              <h3>No matching programs found</h3>
              <p>
                Try another city or branch. Your database may not yet contain
                programs that match these preferences.
              </p>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

export default SmartCollegePredictor