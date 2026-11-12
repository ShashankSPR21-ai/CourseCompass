
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { CollegeCover, CollegeLogo } from './CollegeVisual'
import CollegeEnquiry from './CollegeEnquiry'
import './CollegeFinder.css'

const SAVED_COLLEGES_KEY = 'coursecompass_saved_colleges'

const EMPTY_FILTERS = {
  search: '',
  city: 'All cities',
  collegeType: 'All types',
  branch: 'All branches',
  exam: 'All exams',
  maxFee: '',
  minPlacement: '',
  minPackage: '',
  hostel: 'Any',
  savedOnly: false,
  sort: 'name',
}

function asText(value) {
  return value == null ? '' : String(value)
}

function parseFee(value) {
  if (value == null || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  let text = String(value)
    .trim()
    .toLowerCase()
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')

  if (!text) return null

  let multiplier = 1

  if (/\b(crore|crores|cr)\b/.test(text)) {
    multiplier = 10000000
  } else if (/\b(lakh|lakhs|lac|lacs)\b/.test(text)) {
    multiplier = 100000
  } else if (/\b(thousand|thousands)\b/.test(text)) {
    multiplier = 1000
  }

  const match = text.match(/-?\d+(\.\d+)?/)

  if (!match) return null

  const amount = Number(match[0]) * multiplier

  return Number.isFinite(amount) && amount > 0
    ? amount
    : null
}

function formatMoney(value) {
  const amount = parseFee(value)

  if (amount == null) return 'Not provided'

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
  const value = college?.college_programs

  return Array.isArray(value)
    ? value
    : value
      ? [value]
      : []
}

function getNumber(value) {
  if (value == null || value === '') return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function getCourseBranch(course) {
  return (
    course?.name ||
    course?.course_name ||
    course?.title ||
    course?.branch ||
    'Course'
  )
}

function getCourseFee(course) {
  if (!course) return null

  const annualFee = parseFee(course.annual_fee)

  if (annualFee != null) {
    return annualFee
  }

  const totalFee = parseFee(course.total_fee)
  const duration = Number(course.duration_years)

  if (
    totalFee != null &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    const annualFeeFromTotal = totalFee / duration

    return Number.isFinite(annualFeeFromTotal) &&
      annualFeeFromTotal > 0
      ? annualFeeFromTotal
      : null
  }

  return null
}

function getLowestFee(college) {
  if (!college) return null

  const directCollegeFee = parseFee(
    college.annual_fee ?? college.tuition_fee_annual
  )

  if (directCollegeFee != null) {
    return directCollegeFee
  }

  const programFees = getPrograms(college)
    .map((program) => parseFee(program?.annual_fee))
    .filter((fee) => fee != null)

  const courseFees = (college.published_courses || [])
    .map(getCourseFee)
    .filter((fee) => fee != null)

  const allFees = [...programFees, ...courseFees]

  return allFees.length > 0
    ? Math.min(...allFees)
    : null
}

function readSavedCollegeIds() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SAVED_COLLEGES_KEY) || '[]',
    )

    return Array.isArray(parsed)
      ? [...new Set(parsed.map(String))]
      : []
  } catch {
    return []
  }
}

export default function CollegeFinder() {
  const [colleges, setColleges] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedCollege, setSelectedCollege] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [savedCollegeIds, setSavedCollegeIds] =
    useState(readSavedCollegeIds)

  useEffect(() => {
    let active = true

    async function loadColleges() {
      setLoading(true)
      setLoadError('')

      try {
        const {
          data: collegeData,
          error: collegeError,
        } = await supabase
          .from('colleges')
          .select('*, college_programs(*)')
          .eq('is_published', true)
          .order('name', { ascending: true })
          .limit(500)

        if (collegeError) throw collegeError

        const {
          data: courseData,
          error: courseError,
        } = await supabase
          .from('courses')
          .select('*')
          .eq('is_published', true)
          .limit(1000)

        if (courseError) throw courseError

        if (!active) return

        const publishedColleges = collegeData || []
        const publishedCourses = courseData || []

        console.info(
          '[CollegeFinder] Published colleges:',
          publishedColleges.length,
        )

        console.info(
          '[CollegeFinder] Published courses:',
          publishedCourses.length,
        )

        console.table(
          publishedCourses.map((course) => ({
            id: course.id,
            name: getCourseBranch(course),
            college_id: course.college_id,
            is_published: course.is_published,
            annual_fee: course.annual_fee,
            total_fee: course.total_fee,
            duration_years: course.duration_years,
            calculated_annual_fee: getCourseFee(course),
          })),
        )

        const coursesByCollege = new Map()

        publishedCourses.forEach((course) => {
          if (course.college_id == null) {
            console.warn(
              '[CollegeFinder] Course has no college_id:',
              course.id,
              getCourseBranch(course),
            )

            return
          }

          const key = String(course.college_id)

          if (!coursesByCollege.has(key)) {
            coursesByCollege.set(key, [])
          }

          coursesByCollege.get(key).push(course)
        })

        const mergedColleges = publishedColleges.map((college) => {
          const savedPrograms = getPrograms(college)

          const publishedCoursesForCollege =
            coursesByCollege.get(String(college.id)) || []

          const mappedCourses = publishedCoursesForCollege.map(
            (course) => ({
              ...course,
              display_name: getCourseBranch(course),
              branch:
                course.branch ||
                course.name ||
                course.course_name ||
                course.title ||
                'Course',
              annual_fee: getCourseFee(course),
              source: 'courses',
            }),
          )

          const mergedCollege = {
            ...college,
            college_programs: savedPrograms,
            published_courses: mappedCourses,
          }

          console.info('[CollegeFinder] College fee summary:', {
            college: college.name,
            college_id: college.id,
            linked_courses: mappedCourses.length,
            program_fees: savedPrograms.map(
              (program) => program.annual_fee,
            ),
            course_fees: mappedCourses.map(
              (course) => course.annual_fee,
            ),
            lowest_annual_fee: getLowestFee(mergedCollege),
          })

          return mergedCollege
        })

        if (!active) return

        setColleges(mergedColleges)

        setSelectedCollege((current) => {
          if (!current) return null

          return (
            mergedColleges.find(
              (college) =>
                String(college.id) === String(current.id),
            ) || null
          )
        })
      } catch (error) {
        console.error(
          'Unable to load college/course data:',
          error,
        )

        if (active) {
          setLoadError(
            error.message ||
            'Unable to load college and course data. Check Supabase table names, permissions, and policies.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadColleges()

    // Pick up edits a coordinator published while this page stayed open.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setReloadKey((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reloadKey])

  useEffect(() => {
    function handleStorageChange(event) {
      if (
        event.key === SAVED_COLLEGES_KEY ||
        event.key === null
      ) {
        setSavedCollegeIds(readSavedCollegeIds())
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener(
        'storage',
        handleStorageChange,
      )
    }
  }, [])

  function toggleSavedCollege(college) {
    if (college?.id == null) return

    const id = String(college.id)
    const isSaved = savedCollegeIds.includes(id)

    const updated = isSaved
      ? savedCollegeIds.filter((savedId) => savedId !== id)
      : [...savedCollegeIds, id]

    try {
      localStorage.setItem(
        SAVED_COLLEGES_KEY,
        JSON.stringify(updated),
      )

      setSavedCollegeIds(updated)
    } catch (error) {
      console.error('Unable to save college:', error)

      window.alert(
        'Unable to save this college. Check your browser storage settings.',
      )
    }
  }

  function isCollegeSaved(college) {
    return (
      college?.id != null &&
      savedCollegeIds.includes(String(college.id))
    )
  }

  const cities = useMemo(() => {
    const values = colleges
      .map((college) => asText(college.city).trim())
      .filter(Boolean)

    return [
      'All cities',
      ...Array.from(new Set(values)).sort((a, b) =>
        a.localeCompare(b),
      ),
    ]
  }, [colleges])

  const collegeTypes = useMemo(() => {
    const values = colleges
      .map((college) =>
        asText(college.institution_type).trim(),
      )
      .filter(Boolean)

    return [
      'All types',
      ...Array.from(new Set(values)).sort((a, b) =>
        a.localeCompare(b),
      ),
    ]
  }, [colleges])

  const branches = useMemo(() => {
    const values = colleges
      .flatMap((college) => [
        ...getPrograms(college).map((program) =>
          asText(program.branch).trim(),
        ),
        ...(college.published_courses || []).map((course) =>
          asText(course.branch).trim(),
        ),
      ])
      .filter(Boolean)

    return [
      'All branches',
      ...Array.from(new Set(values)).sort((a, b) =>
        a.localeCompare(b),
      ),
    ]
  }, [colleges])

  const exams = useMemo(() => {
    const values = colleges
      .flatMap((college) =>
        getPrograms(college).map((program) =>
          asText(program.exam).trim(),
        ),
      )
      .filter(Boolean)

    return [
      'All exams',
      ...Array.from(new Set(values)).sort((a, b) =>
        a.localeCompare(b),
      ),
    ]
  }, [colleges])

  const filteredColleges = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    const maxFee = getNumber(filters.maxFee)
    const minPlacement = getNumber(filters.minPlacement)
    const minPackage = getNumber(filters.minPackage)

    const results = colleges.filter((college) => {
      const programs = getPrograms(college)
      const publishedCourses = college.published_courses || []

      const searchable = [
        college.name,
        college.city,
        college.state,
        college.institution_type,
        college.description,
        college.website,
        ...programs.flatMap((program) => [
          program.branch,
          program.exam,
          program.category,
          program.cutoff_year,
          program.cutoff_round,
        ]),
        ...publishedCourses.flatMap((course) => [
          course.name,
          course.course_name,
          course.title,
          course.degree_level,
          course.course_description,
        ]),
      ]
        .map(asText)
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !query || searchable.includes(query)

      const matchesCity =
        filters.city === 'All cities' ||
        college.city === filters.city

      const matchesType =
        filters.collegeType === 'All types' ||
        college.institution_type === filters.collegeType

      const matchesBranch =
        filters.branch === 'All branches' ||
        programs.some(
          (program) => program.branch === filters.branch,
        ) ||
        publishedCourses.some(
          (course) => course.branch === filters.branch,
        )

      const matchesExam =
        filters.exam === 'All exams' ||
        programs.some(
          (program) => program.exam === filters.exam,
        )

      const collegeLowestFee = getLowestFee(college)

      const matchesBudget =
        maxFee == null ||
        (collegeLowestFee != null &&
          collegeLowestFee <= maxFee)

      const placementRate = getNumber(college.placement_rate)

      const matchesPlacement =
        minPlacement == null ||
        (placementRate != null &&
          placementRate >= minPlacement)

      const averagePackage = getNumber(
        college.avg_package_lpa,
      )

      const matchesPackage =
        minPackage == null ||
        (averagePackage != null &&
          averagePackage >= minPackage)

      const matchesHostel =
        filters.hostel === 'Any' ||
        (filters.hostel === 'Available' &&
          college.hostel_available === true) ||
        (filters.hostel === 'Not available' &&
          college.hostel_available === false)

      const matchesSaved =
        !filters.savedOnly ||
        savedCollegeIds.includes(String(college.id))

      return (
        matchesSearch &&
        matchesCity &&
        matchesType &&
        matchesBranch &&
        matchesExam &&
        matchesBudget &&
        matchesPlacement &&
        matchesPackage &&
        matchesHostel &&
        matchesSaved
      )
    })

    if (filters.sort === 'city') {
      return [...results].sort(
        (a, b) =>
          asText(a.city).localeCompare(asText(b.city)) ||
          asText(a.name).localeCompare(asText(b.name)),
      )
    }

    if (filters.sort === 'fee') {
      return [...results].sort((a, b) => {
        const aFee = getLowestFee(a) ?? Infinity
        const bFee = getLowestFee(b) ?? Infinity

        return (
          aFee - bFee ||
          asText(a.name).localeCompare(asText(b.name))
        )
      })
    }

    if (filters.sort === 'placement') {
      return [...results].sort(
        (a, b) =>
          (getNumber(b.placement_rate) ?? -Infinity) -
          (getNumber(a.placement_rate) ?? -Infinity) ||
          asText(a.name).localeCompare(asText(b.name)),
      )
    }

    if (filters.sort === 'package') {
      return [...results].sort(
        (a, b) =>
          (getNumber(b.avg_package_lpa) ?? -Infinity) -
          (getNumber(a.avg_package_lpa) ?? -Infinity) ||
          asText(a.name).localeCompare(asText(b.name)),
      )
    }

    return [...results].sort((a, b) =>
      asText(a.name).localeCompare(asText(b.name)),
    )
  }, [colleges, filters, savedCollegeIds])

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS })
  }

  return (
    <section
      className="ccf-page"
      aria-labelledby="ccf-title"
    >
      <div className="ccut-refresh-row">
        <button
          type="button"
          className="ccut-refresh"
          onClick={() => setReloadKey((n) => n + 1)}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : '↻ Refresh colleges'}
        </button>
      </div>

      <div className="ccf-hero">
        <div className="ccf-hero-copy">
          <span className="ccf-eyebrow">
            MAKE YOUR NEXT MOVE
          </span>

          <h1 id="ccf-title">Find your college</h1>

          <p>
            Discover colleges that match your budget, preferred
            branches, placement expectations, and other requirements.
          </p>
        </div>

        <div className="ccf-hero-icon" aria-hidden="true">
          🏛️
        </div>
      </div>

      <div className="ccf-summary-row">
        <div className="ccf-summary-card">
          <span className="ccf-summary-icon">🏫</span>
          <div>
            <strong>{loading ? '—' : colleges.length}</strong>
            <span>Colleges listed</span>
          </div>
        </div>

        <div className="ccf-summary-card">
          <span className="ccf-summary-icon">📍</span>
          <div>
            <strong>{loading ? '—' : cities.length - 1}</strong>
            <span>Cities covered</span>
          </div>
        </div>

        <div className="ccf-summary-card">
          <span className="ccf-summary-icon">🎓</span>
          <div>
            <strong>{loading ? '—' : branches.length - 1}</strong>
            <span>Branch options</span>
          </div>
        </div>

        <div className="ccf-summary-card">
          <span className="ccf-summary-icon">❤️</span>
          <div>
            <strong>{savedCollegeIds.length}</strong>
            <span>Saved colleges</span>
          </div>
        </div>
      </div>

      <div className="ccf-filter-panel">
        <label className="ccf-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            value={filters.search}
            onChange={(event) =>
              updateFilter('search', event.target.value)
            }
            placeholder="Search college, city, branch, or exam..."
            aria-label="Search colleges"
          />
        </label>

        <div className="ccf-filter-controls">
          <label>
            <span>City</span>
            <select
              value={filters.city}
              onChange={(event) =>
                updateFilter('city', event.target.value)
              }
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>College type</span>
            <select
              value={filters.collegeType}
              onChange={(event) =>
                updateFilter('collegeType', event.target.value)
              }
            >
              {collegeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Branch</span>
            <select
              value={filters.branch}
              onChange={(event) =>
                updateFilter('branch', event.target.value)
              }
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Entrance exam</span>
            <select
              value={filters.exam}
              onChange={(event) =>
                updateFilter('exam', event.target.value)
              }
            >
              {exams.map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Maximum annual fee (₹)</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={filters.maxFee}
              onChange={(event) =>
                updateFilter('maxFee', event.target.value)
              }
              placeholder="e.g. 100000"
            />
          </label>

          <label>
            <span>Minimum placement (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={filters.minPlacement}
              onChange={(event) =>
                updateFilter('minPlacement', event.target.value)
              }
              placeholder="e.g. 70"
            />
          </label>

          <label>
            <span>Minimum average package (LPA)</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={filters.minPackage}
              onChange={(event) =>
                updateFilter('minPackage', event.target.value)
              }
              placeholder="e.g. 5"
            />
          </label>

          <label>
            <span>Hostel availability</span>
            <select
              value={filters.hostel}
              onChange={(event) =>
                updateFilter('hostel', event.target.value)
              }
            >
              <option value="Any">Any</option>
              <option value="Available">Hostel available</option>
              <option value="Not available">Hostel not available</option>
            </select>
          </label>

          <label>
            <span>Sort by</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                updateFilter('sort', event.target.value)
              }
            >
              <option value="name">College name</option>
              <option value="city">City</option>
              <option value="fee">Annual fee (low to high)</option>
              <option value="placement">Highest placement rate</option>
              <option value="package">Highest average package</option>
            </select>
          </label>
        </div>

        <div className="ccf-advanced-options">
          <label className="ccf-saved-filter">
            <input
              type="checkbox"
              checked={filters.savedOnly}
              onChange={(event) =>
                updateFilter('savedOnly', event.target.checked)
              }
            />
            <span>❤️ Show only my saved colleges</span>
          </label>

          <button
            type="button"
            className="ccf-reset-button"
            onClick={clearFilters}
          >
            ↺ Reset all filters
          </button>
        </div>

        <div className="ccf-filter-footer">
          <span>
            {loading
              ? 'Loading colleges…'
              : `Showing ${filteredColleges.length} of ${colleges.length} colleges`}
          </span>

          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      {loadError && (
        <div className="ccf-alert" role="alert">
          <strong>College data unavailable</strong>
          <p>{loadError}</p>
        </div>
      )}

      {loading ? (
        <div className="ccf-state">
          <span className="ccf-spinner" />
          <p>Loading colleges…</p>
        </div>
      ) : !loadError && filteredColleges.length === 0 ? (
        <div className="ccf-state ccf-empty">
          <span>🔎</span>
          <h2>No colleges match your filters</h2>
          <p>Try changing your search or removing some filters.</p>
          <button type="button" onClick={clearFilters}>
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="ccf-college-grid">
          {filteredColleges.map((college) => {
            const programs = getPrograms(college)
            const publishedCourses =
              college.published_courses || []

            const visibleBranches = [
              ...new Set([
                ...programs
                  .map((program) => program.branch)
                  .filter(Boolean),
                ...publishedCourses
                  .map((course) => course.branch)
                  .filter(Boolean),
              ]),
            ]

            const saved = isCollegeSaved(college)
            const lowestFee = getLowestFee(college)

            // Temporary diagnostic: remove after confirming the fee issue.
            console.log('[CollegeFinder] Card fee check:', {
              college: college.name,
              college_id: college.id,
              lowestFee,
              formattedFee: formatMoney(lowestFee),
              courses: publishedCourses.map((course) => ({
                name: course.name,
                college_id: course.college_id,
                annual_fee: course.annual_fee,
                total_fee: course.total_fee,
                duration_years: course.duration_years,
              })),
            })

            return (
              <article
                className="ccf-college-card"
                key={college.id}
              >
                <div className="cv-banner">
                  <CollegeCover college={college} />
                  <span className="ccf-type-pill cv-pill">
                    {(college.institution_type || 'College')
                      .replaceAll('_', ' ')}
                  </span>
                  <CollegeLogo college={college} size={60} />
                </div>

                <h2>{college.name}</h2>

                <p className="ccf-location">
                  📍{' '}
                  {[college.city, college.state]
                    .filter(Boolean)
                    .join(', ') || 'Location not provided'}
                </p>

                <p className="ccf-description">
                  {college.description ||
                    'Explore this institution and review its available programmes and admission details.'}
                </p>

                <div className="ccf-branch-list">
                  <span className="ccf-meta-label">
                    Available branches
                  </span>

                  <div>
                    {visibleBranches.length ? (
                      visibleBranches.slice(0, 3).map((branch) => (
                        <span className="ccf-branch-chip" key={branch}>
                          {branch}
                        </span>
                      ))
                    ) : (
                      <span className="ccf-muted">
                        Not provided yet
                      </span>
                    )}

                    {visibleBranches.length > 3 && (
                      <span className="ccf-branch-chip">
                        +{visibleBranches.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="ccf-card-stats">
                  <div>
                    <span>Annual fee</span>
                    <strong>{formatMoney(lowestFee)}</strong>
                  </div>

                  <div>
                    <span>Average package</span>
                    <strong>{formatLpa(college.avg_package_lpa)}</strong>
                  </div>

                  <div>
                    <span>Placement rate</span>
                    <strong>
                      {college.placement_rate != null
                        ? `${college.placement_rate}%`
                        : 'Not provided'}
                    </strong>
                  </div>

                  <div>
                    <span>Hostel</span>
                    <strong>
                      {college.hostel_available == null
                        ? 'Not provided'
                        : college.hostel_available
                          ? 'Available'
                          : 'Not available'}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="ccf-save-button"
                  data-saved={saved}
                  aria-pressed={saved}
                  onClick={() => toggleSavedCollege(college)}
                >
                  {saved
                    ? '♥ Saved — Remove from wishlist'
                    : '♡ Save College'}
                </button>

                <button
                  className="ccf-details-button"
                  type="button"
                  onClick={() => setSelectedCollege(college)}
                >
                  View college details <span>→</span>
                </button>
              </article>
            )
          })}
        </div>
      )}

      {selectedCollege && (
        <div
          className="ccf-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCollege(null)
            }
          }}
        >
          <section
            className="ccf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ccf-modal-title"
          >
            <button
              className="ccf-modal-close"
              type="button"
              onClick={() => setSelectedCollege(null)}
              aria-label="Close college details"
            >
              ×
            </button>

            <div className="cv-modal-head">
              <CollegeCover college={selectedCollege} />
              <CollegeLogo college={selectedCollege} size={68} />
            </div>

            <span className="ccf-eyebrow">COLLEGE DETAILS</span>

            <h2 id="ccf-modal-title">{selectedCollege.name}</h2>

            <p className="ccf-location">
              📍{' '}
              {[selectedCollege.city, selectedCollege.state]
                .filter(Boolean)
                .join(', ') || 'Location not provided'}
            </p>

            {selectedCollege.description && (
              <p>{selectedCollege.description}</p>
            )}

            <button
              type="button"
              className="ccf-save-button"
              data-saved={isCollegeSaved(selectedCollege)}
              aria-pressed={isCollegeSaved(selectedCollege)}
              onClick={() => toggleSavedCollege(selectedCollege)}
            >
              {isCollegeSaved(selectedCollege)
                ? '♥ Saved — Remove from wishlist'
                : '♡ Save College to Wishlist'}
            </button>

            <div className="ccf-detail-grid">
              <div>
                <span>College type</span>
                <strong>
                  {(selectedCollege.institution_type || 'Not provided')
                    .replaceAll('_', ' ')}
                </strong>
              </div>

              <div>
                <span>Established</span>
                <strong>
                  {selectedCollege.established_year || 'Not provided'}
                </strong>
              </div>

              <div>
                <span>Campus area</span>
                <strong>
                  {selectedCollege.campus_area_acres != null
                    ? `${selectedCollege.campus_area_acres} acres`
                    : 'Not provided'}
                </strong>
              </div>

              <div>
                <span>Annual fee</span>
                <strong>
                  {formatMoney(getLowestFee(selectedCollege))}
                </strong>
              </div>

              <div>
                <span>Average package</span>
                <strong>{formatLpa(selectedCollege.avg_package_lpa)}</strong>
              </div>

              <div>
                <span>Highest package</span>
                <strong>{formatLpa(selectedCollege.highest_package_lpa)}</strong>
              </div>

              <div>
                <span>Placement rate</span>
                <strong>
                  {selectedCollege.placement_rate != null
                    ? `${selectedCollege.placement_rate}%`
                    : 'Not provided'}
                </strong>
              </div>

              <div>
                <span>Hostel</span>
                <strong>
                  {selectedCollege.hostel_available == null
                    ? 'Not provided'
                    : selectedCollege.hostel_available
                      ? 'Available'
                      : 'Not available'}
                </strong>
              </div>
            </div>

            {selectedCollege.hostel_details && (
              <p>{selectedCollege.hostel_details}</p>
            )}

            {Array.isArray(selectedCollege.top_recruiters) &&
              selectedCollege.top_recruiters.length > 0 && (
                <p>
                  <strong>Recruiters:</strong>{' '}
                  {selectedCollege.top_recruiters.join(', ')}
                </p>
              )}

            <CollegeEnquiry college={selectedCollege} />

            <h3>Published courses</h3>

            {(selectedCollege.published_courses || []).length > 0 ? (
              <div className="ccf-program-list">
                {selectedCollege.published_courses.map((course) => (
                  <div className="ccf-program-row" key={course.id}>
                    <strong>{getCourseBranch(course)}</strong>

                    <span>
                      Degree: {course.degree_level || 'Not provided'}
                    </span>

                    <span>
                      Duration:{' '}
                      {course.duration_years
                        ? `${course.duration_years} years`
                        : 'Not provided'}
                    </span>

                    <span>
                      Annual fee: {formatMoney(getCourseFee(course))}
                    </span>

                    <span>
                      Total fee: {formatMoney(course.total_fee)}
                    </span>

                    <span>
                      Total seats: {course.total_seats ?? 'Not provided'}
                    </span>

                    {course.course_description && (
                      <p>{course.course_description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="ccf-muted">
                No published courses are currently linked to this college.
              </p>
            )}

            <h3>Additional admission details</h3>

            {getPrograms(selectedCollege).length > 0 ? (
              <div className="ccf-program-list">
                {getPrograms(selectedCollege).map((program) => (
                  <div
                    className="ccf-program-row"
                    key={
                      program.id ||
                      `${program.branch}-${program.exam}-${program.category}`
                    }
                  >
                    <strong>
                      {program.branch || 'Branch not specified'}
                    </strong>

                    <span>Exam: {program.exam || 'Not provided'}</span>

                    <span>
                      Category: {program.category || 'Not provided'}
                    </span>

                    <span>
                      Annual fee: {formatMoney(program.annual_fee)}
                    </span>

                    <span>
                      Cutoff rank: {program.cutoff_rank ?? 'Not provided'}
                    </span>

                    <span>
                      Cutoff year: {program.cutoff_year ?? 'Not provided'}
                    </span>

                    <span>
                      Cutoff round: {program.cutoff_round || 'Not provided'}
                    </span>

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
                ))}
              </div>
            ) : (
              <p className="ccf-muted">
                Additional cutoff and admission details have not been added yet.
              </p>
            )}

            {selectedCollege.website && (
              <a
                className="ccf-website-link"
                href={selectedCollege.website}
                target="_blank"
                rel="noreferrer"
              >
                Visit official website ↗
              </a>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
