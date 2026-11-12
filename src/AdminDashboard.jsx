import './AdminDashboard.css'
import './workflow.css'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import MenuButton from './MenuButton'
import { useDrawer } from './lib/useDrawer'
import {
  STATUS_LABELS,
  STREAMS,
  buildDiff,
  formatDate,
  formatValue,
} from './lib/changeRequests'

// Renders one side (before / after) of a changed field.
function DiffValue({ field, value }) {
  if (field.type === 'image') {
    return value ? (
      <div className="wf-diff-photos">
        <img src={value} alt={field.label} loading="lazy" />
      </div>
    ) : (
      '—'
    )
  }

  if (field.type === 'images') {
    const urls = Array.isArray(value) ? value : []

    return urls.length ? (
      <div className="wf-diff-photos">
        {urls.map((url) => (
          <img key={url} src={url} alt="" loading="lazy" />
        ))}
      </div>
    ) : (
      '—'
    )
  }

  return (
    <span className={field.type === 'longtext' ? 'wf-text' : undefined}>
      {formatValue(field, value)}
    </span>
  )
}

function getNowIso() {
  return new Date().toISOString()
}

export default function AdminDashboard({ user, onLogout }) {
  const [profiles, setProfiles] = useState([])
  const [colleges, setColleges] = useState([])
  const [courses, setCourses] = useState([])

  const [activePage, setActivePage] = useState('dashboard')
  const drawer = useDrawer()

  const [loading, setLoading] = useState(true)
  const [collegesLoading, setCollegesLoading] = useState(true)
  const [coursesLoading, setCoursesLoading] = useState(true)

  const [updatingId, setUpdatingId] = useState(null)
  const [collegeUpdatingId, setCollegeUpdatingId] = useState(null)
  const [courseUpdatingId, setCourseUpdatingId] = useState(null)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [collegeError, setCollegeError] = useState('')
  const [addCollegeOpen, setAddCollegeOpen] = useState(false)
  const [addCollegeForm, setAddCollegeForm] = useState({ name: '', city: '', state: 'Karnataka', institution_type: '' })
  const [addingCollege, setAddingCollege] = useState(false)
  const EMPTY_NEW_COURSE = {
    name: '',
    stream_id: '1',
    degree_level: 'undergraduate',
    duration_years: '',
    course_description: '',
  }
  const [addCourseOpen, setAddCourseOpen] = useState(false)
  const [addCourseForm, setAddCourseForm] = useState(EMPTY_NEW_COURSE)
  const [addingCourse, setAddingCourse] = useState(false)
  const [courseError, setCourseError] = useState('')

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [collegeFilter, setCollegeFilter] = useState('all')
  const [collegeSearch, setCollegeSearch] = useState('')

  const [courseFilter, setCourseFilter] = useState('all')
  const [courseSearch, setCourseSearch] = useState('')

  // Coordinator change requests (draft → pending → approved / rejected)
  const [changes, setChanges] = useState([])
  const [changesLoading, setChangesLoading] = useState(true)
  const [changesError, setChangesError] = useState('')
  const [changeBefore, setChangeBefore] = useState({ colleges: {}, courses: {}, programs: {} })
  const [changeFilter, setChangeFilter] = useState('pending')
  const [autoPublish, setAutoPublish] = useState(null) // null = unknown / script 003 not run
  const [autoPublishBusy, setAutoPublishBusy] = useState(false)
  const [autoPublishProblem, setAutoPublishProblem] = useState('')
  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewingId, setReviewingId] = useState(null)

  // "Approve coordinator & assign college" dialog
  const [assignTarget, setAssignTarget] = useState(null)
  const [assignForm, setAssignForm] = useState({
    collegeId: '',
    newName: '',
    newCity: '',
    newState: 'Karnataka',
  })
  const [assigning, setAssigning] = useState(false)

  // Load user profiles.
  const loadProfiles = useCallback(async () => {
    setLoading(true)

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, approval_status, created_at, college_id, requested_college_id, requested_college_name, requested_college_city, phone'
        )
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('Profiles fetch error:', fetchError)
        setError(`Unable to load profiles: ${fetchError.message}`)
        setProfiles([])
        return
      }

      setProfiles(data || [])
      setError('')
    } catch (err) {
      console.error('Unexpected profiles error:', err)
      setError(err.message || 'Unexpected error loading profiles.')
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load all colleges, including unpublished colleges.
  const loadColleges = useCallback(async () => {
    setCollegesLoading(true)
    setCollegeError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('colleges')
        .select(
          'id, name, slug, city, state, institution_type, is_published, created_at'
        )
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('Colleges fetch error:', fetchError)

        setCollegeError(
          `Unable to fetch colleges: ${fetchError.message} ` +
          `(code: ${fetchError.code || 'unknown'})`
        )

        setColleges([])
        return
      }

      setColleges(data || [])
    } catch (err) {
      console.error('Unexpected colleges error:', err)

      setCollegeError(
        err.message || 'Unexpected error loading colleges.'
      )

      setColleges([])
    } finally {
      setCollegesLoading(false)
    }
  }, [])

  // Load courses and their associated college details.
  const loadCourses = useCallback(async () => {
    setCoursesLoading(true)
    setCourseError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('courses')
        .select(`
          id,
          college_id,
          name,
          degree_level,
          duration_years,
          total_seats,
          annual_fee,
          total_fee,
          course_description,
          is_published,
          created_at,
          colleges (
            id,
            name,
            city,
            state,
            is_published
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('Courses fetch error:', fetchError)

        setCourseError(
          `Unable to fetch courses: ${fetchError.message} ` +
          `(code: ${fetchError.code || 'unknown'})`
        )

        setCourses([])
        return
      }

      setCourses(data || [])
    } catch (err) {
      console.error('Unexpected courses error:', err)

      setCourseError(
        err.message || 'Unexpected error loading courses.'
      )

      setCourses([])
    } finally {
      setCoursesLoading(false)
    }
  }, [])

  // Load coordinator change requests together with the CURRENT live values
  // (so the admin can see exactly what would change).
  const loadAutoPublish = useCallback(async () => {
    const { data, error: settingError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'coordinator_auto_publish')
      .maybeSingle()

    setAutoPublishProblem(
      settingError
        ? settingError.message
        : !data
          ? 'The setting row is missing.'
          : ''
    )
    setAutoPublish(settingError || !data ? null : data.value === 'on')
  }, [])

  async function toggleAutoPublish() {
    setAutoPublishBusy(true)
    setError('')
    setMessage('')

    try {
      const next = !autoPublish
      const { error: saveError } = await supabase
        .from('app_settings')
        .upsert({ key: 'coordinator_auto_publish', value: next ? 'on' : 'off', updated_at: new Date().toISOString() })

      if (saveError) throw saveError

      setAutoPublish(next)
      setMessage(
        next
          ? 'Instant publishing is ON – coordinator edits go live for students immediately.'
          : 'Instant publishing is OFF – coordinator edits wait for your approval.'
      )
    } catch (err) {
      setError(err.message || 'Could not change the setting.')
    } finally {
      setAutoPublishBusy(false)
    }
  }

  const loadChanges = useCallback(async () => {
    setChangesLoading(true)
    setChangesError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('change_requests')
        .select('*, colleges(name, city)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (fetchError) throw fetchError

      const rows = data || []

      const collegeIds = [
        ...new Set(
          rows.filter((row) => row.entity === 'college').map((row) => row.college_id)
        ),
      ]

      const courseIds = [
        ...new Set(
          rows
            .filter((row) => row.entity === 'course' && row.entity_id)
            .map((row) => row.entity_id)
        ),
      ]

      const programIds = [
        ...new Set(
          rows
            .filter((row) => row.entity === 'program' && row.entity_id)
            .map((row) => row.entity_id)
        ),
      ]

      const [collegeResult, courseResult, programResult] = await Promise.all([
        collegeIds.length
          ? supabase.from('colleges').select('*').in('id', collegeIds)
          : Promise.resolve({ data: [] }),
        courseIds.length
          ? supabase.from('courses').select('*').in('id', courseIds)
          : Promise.resolve({ data: [] }),
        programIds.length
          ? supabase.from('college_programs').select('*').in('id', programIds)
          : Promise.resolve({ data: [] }),
      ])

      const byId = (list) =>
        Object.fromEntries((list || []).map((item) => [String(item.id), item]))

      setChangeBefore({
        colleges: byId(collegeResult.data),
        courses: byId(courseResult.data),
        programs: byId(programResult.data),
      })

      setChanges(rows)
    } catch (err) {
      console.error('Change requests error:', err)
      setChangesError(
        `Unable to load change requests: ${err.message || 'unknown error'}. Have you run the SQL migration?`
      )
      setChanges([])
    } finally {
      setChangesLoading(false)
    }
  }, [])

  async function reviewChange(change, approve) {
    const note = (reviewNotes[change.id] || '').trim()

    if (!approve && !note) {
      setError('Please write a short note so the coordinator knows what to fix.')
      setMessage('')
      return
    }

    setReviewingId(change.id)
    setError('')
    setMessage('')

    try {
      const { error: rpcError } = await supabase.rpc('admin_review_change', {
        p_id: change.id,
        p_approve: approve,
        p_note: note || null,
      })

      if (rpcError) throw rpcError

      setMessage(
        approve
          ? 'Approved – the changes are now live for students.'
          : 'Rejected – the coordinator can see your note and resubmit.'
      )

      await Promise.all([loadChanges(), loadColleges(), loadCourses()])
    } catch (err) {
      console.error('Review error:', err)
      setError(err.message || 'Unable to review this request.')
    } finally {
      setReviewingId(null)
    }
  }

  function openAssign(profile) {
    const requested = colleges.find(
      (college) => String(college.id) === String(profile.requested_college_id)
    )

    setAssignForm({
      collegeId: String(profile.college_id || requested?.id || ''),
      newName: profile.requested_college_name || '',
      newCity: profile.requested_college_city || '',
      newState: 'Karnataka',
    })

    setAssignTarget(profile)
    setError('')
    setMessage('')
  }

  async function submitAssign(event) {
    event.preventDefault()

    const creating = assignForm.collegeId === '__new__'

    if (!assignForm.collegeId) {
      setError('Choose a college for this coordinator.')
      return
    }

    if (creating && !assignForm.newName.trim()) {
      setError('Enter the new college name.')
      return
    }

    setAssigning(true)
    setError('')

    try {
      const { error: rpcError } = await supabase.rpc('admin_approve_coordinator', {
        p_user: assignTarget.id,
        p_college: creating ? null : assignForm.collegeId,
        p_new_name: creating ? assignForm.newName.trim() : null,
        p_new_city: creating ? assignForm.newCity.trim() : null,
        p_new_state: creating ? assignForm.newState.trim() : null,
      })

      if (rpcError) throw rpcError

      setMessage(
        `${assignTarget.full_name || 'Coordinator'} approved and linked to the college.`
      )

      setAssignTarget(null)
      await Promise.all([loadProfiles(), loadColleges()])
    } catch (err) {
      console.error('Assign error:', err)
      setError(err.message || 'Unable to approve this coordinator.')
    } finally {
      setAssigning(false)
    }
  }

  async function rejectCoordinator(profile) {
    if (
      !window.confirm(
        `Reject ${profile.full_name || profile.email}? They will not be able to edit any college.`
      )
    ) {
      return
    }

    setUpdatingId(profile.id)
    setError('')
    setMessage('')

    try {
      const { error: rpcError } = await supabase.rpc('admin_reject_coordinator', {
        p_user: profile.id,
      })

      if (rpcError) throw rpcError

      setMessage('Coordinator request rejected.')
      await loadProfiles()
    } catch (err) {
      setError(err.message || 'Unable to reject this coordinator.')
    } finally {
      setUpdatingId(null)
    }
  }

  // Initial data loading.
  useEffect(() => {
    let active = true

    async function initialize() {
      if (!active) return
      await Promise.all([
        loadProfiles(),
        loadColleges(),
        loadCourses(),
        loadChanges(),
        loadAutoPublish(),
      ])
    }

    initialize()

    return () => {
      active = false
    }
  }, [loadProfiles, loadColleges, loadCourses, loadChanges, loadAutoPublish])

  // Refresh every section.
  async function refreshAll() {
    setMessage('')
    setError('')
    setCollegeError('')
    setCourseError('')

    await Promise.all([
      loadProfiles(),
      loadColleges(),
      loadCourses(),
      loadChanges(),
      loadAutoPublish(),
    ])
  }

  // Approve, reject, or change a user's role.
  async function updateProfile(profile, changes) {
    if (profile.id === user?.id && changes.role) {
      setError('You cannot change your own role here.')
      setMessage('')
      return
    }

    setUpdatingId(profile.id)
    setError('')
    setMessage('')

    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(changes)
        .eq('id', profile.id)
        .select('id')

      if (updateError) {
        console.error('Profile update error:', updateError)

        setError(
          `Unable to update account: ${updateError.message}`
        )

        return
      }

      if (!data || data.length === 0) {
        setError(
          'No account was updated. Check your admin UPDATE policy on profiles.'
        )

        return
      }

      setMessage('Account updated successfully.')

      await loadProfiles()
    } catch (err) {
      console.error('Unexpected profile update error:', err)

      setError(
        err.message || 'Unexpected error updating account.'
      )
    } finally {
      setUpdatingId(null)
    }
  }

  // Admin adds a brand-new college (name, city, state). It starts unpublished;
  // the admin can assign a coordinator, who then fills in the rest.
  async function handleAddCollege(event) {
    event.preventDefault()

    const name = addCollegeForm.name.trim()
    const city = addCollegeForm.city.trim()
    const stateName = addCollegeForm.state.trim()

    const instType = addCollegeForm.institution_type.trim()

    if (!name || !city || !stateName || !instType) {
      setCollegeError('Enter the college name, city, state and institution type.')
      return
    }

    setAddingCollege(true)
    setCollegeError('')
    setMessage('')
    setError('')

    try {
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const duplicate = colleges.some((c) => c.slug === base)
      const slug = duplicate
        ? `${base}-${Math.random().toString(36).slice(2, 7)}`
        : base

      const { error: insertError } = await supabase
        .from('colleges')
        .insert({
          name,
          slug,
          city,
          state: stateName,
          institution_type: instType,
          is_published: false,
        })

      if (insertError) {
        console.error('Add college error:', insertError)
        setCollegeError(
          `Unable to add college: ${insertError.message} ` +
          `(code: ${insertError.code || 'unknown'})`
        )
        return
      }

      setMessage(`${name} has been added. Assign a coordinator from Users, then publish it.`)
      setAddCollegeForm({ name: '', city: '', state: 'Karnataka', institution_type: '' })
      setAddCollegeOpen(false)
      await loadColleges()
    } catch (err) {
      setCollegeError(err.message || 'Unexpected error adding college.')
    } finally {
      setAddingCollege(false)
    }
  }

  // Publish or unpublish a college.
  async function handleUpdateCollege(college, publish) {
    setCollegeUpdatingId(college.id)
    setCollegeError('')
    setMessage('')
    setError('')

    try {
      const { data, error: updateError } = await supabase
        .from('colleges')
        .update({
          is_published: publish,
          updated_at: getNowIso(),
        })
        .eq('id', college.id)
        .select('id, name, is_published')
        .maybeSingle()

      if (updateError) {
        console.error('College update error:', updateError)

        setCollegeError(
          `Unable to update college: ${updateError.message} ` +
          `(code: ${updateError.code || 'unknown'})`
        )

        return
      }

      if (!data) {
        setCollegeError(
          'No college was updated. Check that the record exists and your admin UPDATE policy permits this operation.'
        )

        return
      }

      setMessage(
        publish
          ? `${data.name} has been published successfully.`
          : `${data.name} has been unpublished.`
      )

      await Promise.all([
        loadColleges(),
        loadCourses(),
      ])
    } catch (err) {
      console.error('Unexpected college update error:', err)

      setCollegeError(
        err.message || 'Unexpected error updating college.'
      )
    } finally {
      setCollegeUpdatingId(null)
    }
  }

  // Admin adds a course directly to any college.
  async function handleAddCourse(event) {
    event.preventDefault()
    const f = addCourseForm
    const years = Number(f.duration_years)

    if (!f.name.trim() || !(years > 0)) {
      setCourseError('Enter the course name and the duration in years.')
      return
    }


    setAddingCourse(true)
    setCourseError('')
    setMessage('')
    setError('')

    try {
      const { error: insertError } = await supabase.from('courses').insert({
        college_id: null, // standalone course, not attached to any college
        name: f.name.trim(),
        stream_id: Number(f.stream_id),
        degree_level: f.degree_level,
        duration_years: years,
        duration: `${years} years`,
        course_description: f.course_description.trim() || null,
        is_published: true,
      })

      if (insertError) {
        console.error('Add course error:', insertError)
        setCourseError(
          `Unable to add course: ${insertError.message} ` +
          `(code: ${insertError.code || 'unknown'})`
        )
        return
      }

      setMessage(`${f.name.trim()} has been added and is now visible to students under Explore Courses.`)
      setAddCourseForm(EMPTY_NEW_COURSE)
      setAddCourseOpen(false)
      await loadCourses()
    } catch (err) {
      setCourseError(err.message || 'Unexpected error adding course.')
    } finally {
      setAddingCourse(false)
    }
  }

  // Publish or unpublish a course.
  async function handleUpdateCourse(course, publish) {
    setCourseUpdatingId(course.id)
    setCourseError('')
    setMessage('')
    setError('')

    /*
     * CORRECTION:
     * A course without college_id is a standalone course.
     * Standalone courses can be published independently.
     *
     * A course with college_id must have a published college.
     */
    const isLinkedCourse = Boolean(course.college_id)

    const linkedCollegePublished =
      course.colleges?.is_published === true

    if (
      publish &&
      isLinkedCourse &&
      !linkedCollegePublished
    ) {
      setCourseError(
        'Publish the associated college first, then publish this course.'
      )

      setCourseUpdatingId(null)
      return
    }

    try {
      const { data, error: updateError } = await supabase
        .from('courses')
        .update({
          is_published: publish,
          updated_at: getNowIso(),
        })
        .eq('id', course.id)
        .select('id, name, is_published')
        .maybeSingle()

      if (updateError) {
        console.error('Course update error:', updateError)

        setCourseError(
          `Unable to update course: ${updateError.message} ` +
          `(code: ${updateError.code || 'unknown'})`
        )

        return
      }

      if (!data) {
        setCourseError(
          'No course was updated. Check that the record exists and your admin UPDATE policy permits this operation.'
        )

        return
      }

      setMessage(
        publish
          ? `${data.name} has been published successfully.`
          : `${data.name} has been unpublished.`
      )

      await loadCourses()
    } catch (err) {
      console.error('Unexpected course update error:', err)

      setCourseError(
        err.message || 'Unexpected error updating course.'
      )
    } finally {
      setCourseUpdatingId(null)
    }
  }

  // Profile search and filters.
  const filteredProfiles = profiles.filter((profile) => {
    const matchesFilter =
      filter === 'all' ||
      profile.role === filter ||
      profile.approval_status === filter

    const searchText = search.toLowerCase()

    const matchesSearch =
      (profile.full_name || '')
        .toLowerCase()
        .includes(searchText) ||
      (profile.email || '')
        .toLowerCase()
        .includes(searchText) ||
      String(profile.id || '')
        .toLowerCase()
        .includes(searchText)

    return matchesFilter && matchesSearch
  })

  // College search and filters.
  const filteredColleges = colleges.filter((college) => {
    const matchesFilter =
      collegeFilter === 'all' ||
      (collegeFilter === 'pending' &&
        !college.is_published) ||
      (collegeFilter === 'published' &&
        college.is_published)

    const searchText = collegeSearch.toLowerCase()

    const matchesSearch =
      (college.name || '')
        .toLowerCase()
        .includes(searchText) ||
      (college.slug || '')
        .toLowerCase()
        .includes(searchText) ||
      (college.city || '')
        .toLowerCase()
        .includes(searchText) ||
      (college.state || '')
        .toLowerCase()
        .includes(searchText)

    return matchesFilter && matchesSearch
  })

  // Course search and filters.
  const filteredCourses = courses.filter((course) => {
    const matchesFilter =
      courseFilter === 'all' ||
      (courseFilter === 'pending' &&
        !course.is_published) ||
      (courseFilter === 'published' &&
        course.is_published)

    const searchText = courseSearch.toLowerCase()

    const matchesSearch =
      (course.name || '')
        .toLowerCase()
        .includes(searchText) ||
      (course.degree_level || '')
        .toLowerCase()
        .includes(searchText) ||
      (course.colleges?.name || '')
        .toLowerCase()
        .includes(searchText) ||
      (course.colleges?.city || '')
        .toLowerCase()
        .includes(searchText)

    return matchesFilter && matchesSearch
  })

  // Dashboard counts.
  const countRole = (role) =>
    profiles.filter((profile) => profile.role === role).length

  const countStatus = (status) =>
    profiles.filter(
      (profile) => profile.approval_status === status
    ).length

  const countUnpublishedColleges = colleges.filter(
    (college) => !college.is_published
  ).length

  const countPublishedColleges = colleges.filter(
    (college) => college.is_published
  ).length

  const countUnpublishedCourses = courses.filter(
    (course) => !course.is_published
  ).length

  const countPublishedCourses = courses.filter(
    (course) => course.is_published
  ).length

  function formatMoney(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return 'Not specified'
    }

    const amount = Number(value)

    if (!Number.isFinite(amount)) {
      return 'Not specified'
    }

    return amount.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    })
  }

  const pendingChanges = changes.filter(
    (change) => change.status === 'pending'
  ).length

  const pendingCoordinators = profiles.filter(
    (profile) =>
      profile.role === 'coordinator' &&
      profile.approval_status === 'pending'
  ).length

  const visibleChanges = changes.filter(
    (change) => changeFilter === 'all' || change.status === changeFilter
  )

  const pageTitles = {
    changes: 'Change Requests',
    dashboard: 'Dashboard',
    courses: 'Course Management',
    users: 'User Management',
    colleges: 'College Management',
  }

  const isRefreshing =
    loading || collegesLoading || coursesLoading || changesLoading

  return (
    <div className="admin-page">
      {/* HEADER */}
      <header className="admin-header">
        <div className="admin-header-brand">
          <MenuButton open={drawer.open} onClick={drawer.toggle} />

          <div className="admin-header-logo">CC</div>

          <div>
            <h1>CourseCompass Admin</h1>
            <p>Administration &amp; Management Portal</p>
          </div>
        </div>

        <div className="admin-header-right">
          <span className="admin-online-indicator">
            <span />
            Administrator
          </span>

          <button
            className="admin-logout"
            onClick={onLogout}
            type="button"
          >
            <span>↪</span> Logout
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <div
          className={`cc-drawer-backdrop${drawer.open ? ' is-open' : ''}`}
          onClick={drawer.close}
          aria-hidden="true"
        />

        {/* SIDEBAR (opens from the menu button) */}
        <aside
          className={`admin-sidebar cc-drawer${drawer.open ? ' is-open' : ''}`}
          aria-label="Admin menu"
          aria-hidden={!drawer.open}
          inert={!drawer.open}
          onClick={(event) => {
            if (event.target.closest('.admin-nav-item')) drawer.close()
          }}
        >
          <button type="button" className="cc-drawer-close cc-drawer-close-float" onClick={drawer.close} aria-label="Close menu">
            ×
          </button>

          <div className="admin-sidebar-title">
            <span className="admin-sidebar-logo">CC</span>

            <div>
              <strong>CourseCompass</strong>
              <small>ADMIN PANEL</small>
            </div>
          </div>

          <p className="admin-sidebar-label">ADMIN WORKSPACE</p>

          <nav className="admin-sidebar-nav">
            <button
              type="button"
              className={`admin-nav-item ${activePage === 'dashboard' ? 'active' : ''
                }`}
              onClick={() => setActivePage('dashboard')}
            >
              <span className="admin-nav-icon">⌂</span>
              <span className="admin-nav-text">Dashboard</span>
            </button>

            <button
              type="button"
              className={`admin-nav-item ${activePage === 'courses' ? 'active' : ''
                }`}
              onClick={() => setActivePage('courses')}
            >
              <span className="admin-nav-icon">▤</span>
              <span className="admin-nav-text">
                Course Management
              </span>

              {countUnpublishedCourses > 0 && (
                <span className="admin-nav-count">
                  {countUnpublishedCourses}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`admin-nav-item ${activePage === 'users' ? 'active' : ''
                }`}
              onClick={() => setActivePage('users')}
            >
              <span className="admin-nav-icon">♙</span>
              <span className="admin-nav-text">
                User Management
              </span>

              {countStatus('pending') > 0 && (
                <span className="admin-nav-count">
                  {countStatus('pending')}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`admin-nav-item ${activePage === 'colleges' ? 'active' : ''
                }`}
              onClick={() => setActivePage('colleges')}
            >
              <span className="admin-nav-icon">▦</span>
              <span className="admin-nav-text">
                College Management
              </span>

              {countUnpublishedColleges > 0 && (
                <span className="admin-nav-count">
                  {countUnpublishedColleges}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`admin-nav-item ${activePage === 'changes' ? 'active' : ''
                }`}
              onClick={() => setActivePage('changes')}
            >
              <span className="admin-nav-icon">✎</span>
              <span className="admin-nav-text">
                Change Requests
              </span>

              {pendingChanges > 0 && (
                <span className="admin-nav-count">
                  {pendingChanges}
                </span>
              )}
            </button>
          </nav>

          <div className="admin-sidebar-footer">
            <span className="admin-sidebar-avatar">A</span>

            <div className="admin-sidebar-user">
              <strong>Administrator</strong>
              <small>{user?.email || 'Admin account'}</small>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="admin-content">
          <div className="admin-page-heading">
            <div>
              <p className="admin-breadcrumb">
                COURSECOMPASS / ADMIN
              </p>

              <h2>{pageTitles[activePage]}</h2>

              <p className="admin-page-subtitle">
                {activePage === 'dashboard' &&
                  'Monitor your platform and review important activity.'}

                {activePage === 'courses' &&
                  'Review, manage and publish courses submitted by coordinators.'}

                {activePage === 'users' &&
                  'Manage user accounts, approvals and account roles.'}

                {activePage === 'colleges' &&
                  'Review college information and control publication.'}

                {activePage === 'changes' &&
                  'Approve or reject edits submitted by college coordinators. Nothing goes live until you approve it.'}
              </p>
            </div>

            <button
              type="button"
              className="admin-refresh"
              onClick={refreshAll}
              disabled={isRefreshing}
            >
              ↻ {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          {/* SUCCESS MESSAGE */}
          {message && (
            <div
              className="admin-message success"
              role="status"
            >
              <span>✓</span> {message}
            </div>
          )}

          {/* GENERAL ERROR */}
          {error && (
            <div
              className="admin-message error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* DASHBOARD */}
          {activePage === 'dashboard' && (
            <>
              <section className="admin-welcome">
                <div className="admin-welcome-content">
                  <span className="admin-welcome-tag">
                    ADMIN OVERVIEW
                  </span>

                  <h3>Welcome back, Administrator!</h3>

                  <p>
                    You are signed in as{' '}
                    <strong>{user?.email || 'Admin'}</strong>.
                    Manage your colleges, courses and users from
                    one place.
                  </p>
                </div>

                <div
                  className="admin-welcome-art"
                  aria-hidden="true"
                >
                  <span>CC</span>
                </div>
              </section>

              {(pendingChanges > 0 || pendingCoordinators > 0) && (
                <div className="wf-banner wf-banner-pending">
                  <div>
                    <strong>Needs your attention</strong>
                    <p>
                      {pendingCoordinators > 0 &&
                        `${pendingCoordinators} coordinator${pendingCoordinators > 1 ? 's' : ''} waiting for approval. `}
                      {pendingChanges > 0 &&
                        `${pendingChanges} change request${pendingChanges > 1 ? 's' : ''} waiting for review.`}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {pendingCoordinators > 0 && (
                      <button type="button" className="approve-btn" onClick={() => { setFilter('pending'); setActivePage('users') }}>
                        Review coordinators
                      </button>
                    )}

                    {pendingChanges > 0 && (
                      <button type="button" className="approve-btn" onClick={() => setActivePage('changes')}>
                        Review changes
                      </button>
                    )}
                  </div>
                </div>
              )}

              <section className="admin-stats">
                <div className="admin-stat-card stat-blue">
                  <div className="admin-stat-top">
                    <span>Total Accounts</span>
                    <span className="admin-stat-icon">♙</span>
                  </div>
                  <strong>{profiles.length}</strong>
                  <small>Registered users</small>
                </div>

                <div className="admin-stat-card stat-purple">
                  <div className="admin-stat-top">
                    <span>Students</span>
                    <span className="admin-stat-icon">♟</span>
                  </div>
                  <strong>{countRole('student')}</strong>
                  <small>Student accounts</small>
                </div>

                <div className="admin-stat-card stat-cyan">
                  <div className="admin-stat-top">
                    <span>Coordinators</span>
                    <span className="admin-stat-icon">♧</span>
                  </div>
                  <strong>{countRole('coordinator')}</strong>
                  <small>Coordinator accounts</small>
                </div>

                <div className="admin-stat-card stat-amber">
                  <div className="admin-stat-top">
                    <span>Pending Users</span>
                    <span className="admin-stat-icon">◷</span>
                  </div>
                  <strong>{countStatus('pending')}</strong>
                  <small>Awaiting account approval</small>
                </div>

                <div className="admin-stat-card stat-orange">
                  <div className="admin-stat-top">
                    <span>Pending Colleges</span>
                    <span className="admin-stat-icon">▦</span>
                  </div>
                  <strong>{countUnpublishedColleges}</strong>
                  <small>Awaiting publication</small>
                </div>

                <div className="admin-stat-card stat-green">
                  <div className="admin-stat-top">
                    <span>Published Colleges</span>
                    <span className="admin-stat-icon">✓</span>
                  </div>
                  <strong>{countPublishedColleges}</strong>
                  <small>Visible colleges</small>
                </div>

                <div className="admin-stat-card stat-pink">
                  <div className="admin-stat-top">
                    <span>Pending Courses</span>
                    <span className="admin-stat-icon">▤</span>
                  </div>
                  <strong>{countUnpublishedCourses}</strong>
                  <small>Awaiting publication</small>
                </div>

                <div className="admin-stat-card stat-teal">
                  <div className="admin-stat-top">
                    <span>Published Courses</span>
                    <span className="admin-stat-icon">✓</span>
                  </div>
                  <strong>{countPublishedCourses}</strong>
                  <small>Visible courses</small>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h3>Quick Management</h3>
                    <p>
                      Choose a section to manage your platform.
                    </p>
                  </div>
                </div>

                <div className="admin-quick-grid">
                  <button
                    type="button"
                    className="admin-quick-card"
                    onClick={() => setActivePage('courses')}
                  >
                    <span className="admin-quick-icon quick-blue">
                      ▤
                    </span>

                    <span className="admin-quick-title">
                      Course Management
                    </span>

                    <span className="admin-quick-description">
                      Review and publish courses
                    </span>

                    <span className="admin-quick-arrow">→</span>
                  </button>

                  <button
                    type="button"
                    className="admin-quick-card"
                    onClick={() => setActivePage('users')}
                  >
                    <span className="admin-quick-icon quick-purple">
                      ♙
                    </span>

                    <span className="admin-quick-title">
                      User Management
                    </span>

                    <span className="admin-quick-description">
                      Approve users and manage roles
                    </span>

                    <span className="admin-quick-arrow">→</span>
                  </button>

                  <button
                    type="button"
                    className="admin-quick-card"
                    onClick={() => setActivePage('colleges')}
                  >
                    <span className="admin-quick-icon quick-green">
                      ▦
                    </span>

                    <span className="admin-quick-title">
                      College Management
                    </span>

                    <span className="admin-quick-description">
                      Review and publish colleges
                    </span>

                    <span className="admin-quick-arrow">→</span>
                  </button>
                </div>
              </section>
            </>
          )}

          {/* CHANGE REQUESTS */}
          {activePage === 'changes' && (
            <section className="admin-panel">
              <div className="admin-users-heading">
                <div>
                  <h3>Change Requests</h3>
                  <p>
                    Each request shows what the coordinator wants to change.
                    Approving publishes it for students immediately.
                  </p>
                </div>
              </div>

              {/* approval-only mode: switch is shown only when script 003 is installed */}
              {autoPublish !== null && (
              <div className={`wf-autopublish ${autoPublish ? 'on' : 'off'}`}>
                  <div>
                    <strong>
                      {autoPublish === null
                        ? 'Instant publishing is not set up'
                        : autoPublish
                          ? '⚡ Instant publishing is ON'
                          : '🛡 Admin approval is required'}
                    </strong>
                    <p>
                      {autoPublish === null
                        ? `Run supabase/003_auto_publish.sql in the Supabase SQL Editor, then press “Refresh Data”.${autoPublishProblem ? ` (Database says: ${autoPublishProblem})` : ''}`
                        : autoPublish
                          ? 'College details, courses and cutoffs edited by a coordinator appear for students right away.'
                          : 'Coordinator edits stay in the list below until you approve them.'}
                    </p>
                  </div>
  
                  {autoPublish !== null && (
                    <button
                      type="button"
                      className="wf-autopublish-btn"
                      onClick={toggleAutoPublish}
                      disabled={autoPublishBusy}
                    >
                      {autoPublish ? 'Require my approval' : 'Publish instantly'}
                    </button>
                  )}
                </div>
  
                )}

              {changesError && (
                <div className="admin-message error" role="alert">
                  {changesError}
                </div>
              )}

              <div className="admin-filters">
                <select
                  value={changeFilter}
                  onChange={(event) => setChangeFilter(event.target.value)}
                  aria-label="Filter change requests"
                >
                  <option value="pending">Waiting for review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Coordinator drafts</option>
                  <option value="all">All requests</option>
                </select>
              </div>

              {changesLoading ? (
                <p className="admin-empty">Loading change requests...</p>
              ) : visibleChanges.length === 0 ? (
                <p className="admin-empty">
                  {changeFilter === 'pending'
                    ? 'Nothing is waiting for review. 🎉'
                    : 'No requests match this filter.'}
                </p>
              ) : (
                <div className="wf-review-list">
                  {visibleChanges.map((change) => {
                    const before =
                      change.entity === 'college'
                        ? changeBefore.colleges[String(change.college_id)]
                        : change.action === 'create'
                          ? {}
                          : change.entity === 'program'
                            ? changeBefore.programs[String(change.entity_id)]
                            : changeBefore.courses[String(change.entity_id)]

                    const rows =
                      change.action === 'delete'
                        ? []
                        : buildDiff(change.entity, before, change.payload)

                    const submitter = profiles.find(
                      (profile) => profile.id === change.submitted_by
                    )

                    return (
                      <article key={change.id} className="wf-review">
                        <header className="wf-review-head">
                          <div>
                            <strong>
                              {change.colleges?.name || 'College'}
                              {change.colleges?.city
                                ? ` — ${change.colleges.city}`
                                : ''}
                            </strong>

                            <p>{change.summary || `${change.entity} ${change.action}`}</p>

                            <small>
                              By {submitter?.full_name || submitter?.email || 'coordinator'} ·{' '}
                              {formatDate(change.submitted_at || change.created_at)}
                            </small>
                          </div>

                          <span className={`wf-pill wf-pill-${change.status}`}>
                            {STATUS_LABELS[change.status] || change.status}
                          </span>
                        </header>

                        {change.action === 'delete' ? (
                          <p className="wf-remove-note">
                            ⚠ The coordinator asks to <strong>remove</strong> the
                            course “{before?.name || 'unknown'}”. Students will no
                            longer see it once you approve.
                          </p>
                        ) : rows.length === 0 ? (
                          <p className="admin-empty">
                            This request no longer differs from what is live.
                          </p>
                        ) : (
                          <div className="admin-table-wrapper">
                            <table className="wf-diff">
                              <thead>
                                <tr>
                                  <th>Field</th>
                                  <th>{change.action === 'create' ? '' : 'Current (live)'}</th>
                                  <th>Proposed</th>
                                </tr>
                              </thead>

                              <tbody>
                                {rows.map((row) => (
                                  <tr key={row.key}>
                                    <td>{row.label}</td>

                                    <td className={change.action === 'create' ? '' : 'wf-before'}>
                                      {change.action === 'create' ? '' : <DiffValue field={row} value={row.before} />}
                                    </td>

                                    <td className="wf-after">
                                      <DiffValue field={row} value={row.after} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {change.status === 'pending' && (
                          <div className="wf-review-actions">
                            <textarea
                              rows={2}
                              placeholder="Note to the coordinator (required when rejecting)"
                              value={reviewNotes[change.id] || ''}
                              onChange={(event) =>
                                setReviewNotes((previous) => ({
                                  ...previous,
                                  [change.id]: event.target.value,
                                }))
                              }
                            />

                            <div className="admin-actions">
                              <button
                                type="button"
                                className="approve-btn"
                                disabled={reviewingId === change.id}
                                onClick={() => reviewChange(change, true)}
                              >
                                {reviewingId === change.id ? 'Saving…' : 'Approve & publish'}
                              </button>

                              <button
                                type="button"
                                className="reject-btn"
                                disabled={reviewingId === change.id}
                                onClick={() => reviewChange(change, false)}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                        {change.status !== 'pending' && change.admin_note && (
                          <p className="wf-note">Admin note: “{change.admin_note}”</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* COLLEGE MANAGEMENT */}
          {activePage === 'colleges' && (
            <section className="admin-panel">
              <div className="admin-users-heading">
                <div>
                  <h3>College Management</h3>
                  <p>
                    Review college submissions and publish
                    colleges for students.
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-refresh"
                  onClick={loadColleges}
                  disabled={collegesLoading}
                >
                  {collegesLoading
                    ? 'Loading...'
                    : 'Refresh Colleges'}
                </button>
              </div>

              {collegeError && (
                <div
                  className="admin-message error"
                  role="alert"
                >
                  {collegeError}
                </div>
              )}

              <div style={{ margin: '12px 0' }}>
                {!addCollegeOpen ? (
                  <button
                    type="button"
                    className="admin-refresh"
                    onClick={() => setAddCollegeOpen(true)}
                  >
                    + Add College
                  </button>
                ) : (
                  <form
                    onSubmit={handleAddCollege}
                    className="admin-filters"
                    style={{ flexWrap: 'wrap', gap: 8 }}
                  >
                    <input
                      type="text"
                      placeholder="College name *"
                      value={addCollegeForm.name}
                      onChange={(e) =>
                        setAddCollegeForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="City *"
                      value={addCollegeForm.city}
                      onChange={(e) =>
                        setAddCollegeForm((f) => ({ ...f, city: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      placeholder="State *"
                      value={addCollegeForm.state}
                      onChange={(e) =>
                        setAddCollegeForm((f) => ({ ...f, state: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="text"
                      list="admin-institution-types"
                      placeholder="Institution type * (e.g. private)"
                      value={addCollegeForm.institution_type}
                      onChange={(e) =>
                        setAddCollegeForm((f) => ({ ...f, institution_type: e.target.value }))
                      }
                      required
                    />
                    <datalist id="admin-institution-types">
                      {[...new Set(colleges.map((c) => c.institution_type).filter(Boolean))].map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <button type="submit" className="admin-refresh" disabled={addingCollege}>
                      {addingCollege ? 'Adding...' : 'Save College'}
                    </button>
                    <button
                      type="button"
                      className="admin-refresh"
                      onClick={() => setAddCollegeOpen(false)}
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              <div className="admin-filters">
                <input
                  type="search"
                  placeholder="Search college, city or state..."
                  value={collegeSearch}
                  onChange={(event) =>
                    setCollegeSearch(event.target.value)
                  }
                />

                <select
                  value={collegeFilter}
                  onChange={(event) =>
                    setCollegeFilter(event.target.value)
                  }
                >
                  <option value="all">All colleges</option>
                  <option value="pending">
                    Awaiting publication
                  </option>
                  <option value="published">Published</option>
                </select>
              </div>

              {collegesLoading ? (
                <p className="admin-empty">
                  Loading colleges...
                </p>
              ) : collegeError && colleges.length === 0 ? (
                <p className="admin-empty">
                  Could not load colleges. Check Supabase
                  permissions and database columns.
                </p>
              ) : filteredColleges.length === 0 ? (
                <p className="admin-empty">
                  No matching colleges found. Select All colleges
                  and refresh.
                </p>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>College</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredColleges.map((college) => {
                        const isUpdating =
                          collegeUpdatingId === college.id

                        return (
                          <tr key={college.id}>
                            <td>
                              <strong>
                                {college.name || 'Unnamed college'}
                              </strong>

                              <small>
                                {college.slug || college.id}
                              </small>
                            </td>

                            <td>
                              {[
                                college.city,
                                college.state,
                              ]
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </td>

                            <td>
                              {college.institution_type || '—'}
                            </td>

                            <td>
                              <span
                                className={`admin-status ${college.is_published
                                  ? 'approved'
                                  : 'pending'
                                  }`}
                              >
                                {college.is_published
                                  ? 'Published'
                                  : 'Awaiting publication'}
                              </span>
                            </td>

                            <td>
                              <div className="admin-actions">
                                {college.is_published ? (
                                  <button
                                    type="button"
                                    className="reject-btn"
                                    disabled={isUpdating}
                                    onClick={() =>
                                      handleUpdateCollege(
                                        college,
                                        false
                                      )
                                    }
                                  >
                                    {isUpdating
                                      ? 'Saving...'
                                      : 'Unpublish'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="approve-btn"
                                    disabled={isUpdating}
                                    onClick={() =>
                                      handleUpdateCollege(
                                        college,
                                        true
                                      )
                                    }
                                  >
                                    {isUpdating
                                      ? 'Publishing...'
                                      : 'Approve & Publish'}
                                  </button>
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
            </section>
          )}

          {/* COURSE MANAGEMENT */}
          {activePage === 'courses' && (
            <section className="admin-panel">
              <div className="admin-users-heading">
                <div>
                  <h3>Course Management</h3>
                  <p>
                    Review courses added by coordinators and
                    publish approved courses.
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-refresh"
                  onClick={loadCourses}
                  disabled={coursesLoading}
                >
                  {coursesLoading
                    ? 'Loading...'
                    : 'Refresh Courses'}
                </button>
              </div>

              {courseError && (
                <div
                  className="admin-message error"
                  role="alert"
                >
                  {courseError}
                </div>
              )}

              <div style={{ margin: '12px 0' }}>
                {!addCourseOpen ? (
                  <button type="button" className="admin-refresh" onClick={() => setAddCourseOpen(true)}>
                    + Add Course
                  </button>
                ) : (
                  <form
                    onSubmit={handleAddCourse}
                    style={{
                      display: 'grid',
                      gap: 16,
                      padding: 20,
                      border: '1px solid #e2e8f0',
                      borderRadius: 16,
                      background: '#f8fafc',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 16 }}>Add a new course</strong>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        This course is not tied to any college. Students will see it
                        under Explore Courses as soon as you save.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <label style={{ display:'grid',gap:6,fontSize:13,fontWeight:600,color:'#475569',gridColumn:'1 / -1' }}>
                        Course name *
                        <input
                          type="text"
                          style={{ padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit',fontWeight:400,background:'#fff',color:'#0f172a',width:'100%',boxSizing:'border-box' }}
                          placeholder="e.g. Prompt Engineering"
                          value={addCourseForm.name}
                          onChange={(e) => setAddCourseForm((f) => ({ ...f, name: e.target.value }))}
                          required
                        />
                      </label>

                      <label style={{ display:'grid',gap:6,fontSize:13,fontWeight:600,color:'#475569' }}>
                        Stream *
                        <select
                          style={{ padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit',fontWeight:400,background:'#fff',color:'#0f172a',width:'100%',boxSizing:'border-box' }}
                          value={addCourseForm.stream_id}
                          onChange={(e) => setAddCourseForm((f) => ({ ...f, stream_id: e.target.value }))}
                        >
                          {STREAMS.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display:'grid',gap:6,fontSize:13,fontWeight:600,color:'#475569' }}>
                        Degree level *
                        <select
                          style={{ padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit',fontWeight:400,background:'#fff',color:'#0f172a',width:'100%',boxSizing:'border-box' }}
                          value={addCourseForm.degree_level}
                          onChange={(e) => setAddCourseForm((f) => ({ ...f, degree_level: e.target.value }))}
                        >
                          <option value="undergraduate">Undergraduate</option>
                          <option value="postgraduate">Postgraduate</option>
                          <option value="diploma">Diploma</option>
                          <option value="doctoral">Doctoral</option>
                        </select>
                      </label>

                      <label style={{ display:'grid',gap:6,fontSize:13,fontWeight:600,color:'#475569' }}>
                        Duration (years) *
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          style={{ padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit',fontWeight:400,background:'#fff',color:'#0f172a',width:'100%',boxSizing:'border-box' }}
                          placeholder="e.g. 4"
                          value={addCourseForm.duration_years}
                          onChange={(e) => setAddCourseForm((f) => ({ ...f, duration_years: e.target.value }))}
                          required
                        />
                      </label>

                      <label style={{ display:'grid',gap:6,fontSize:13,fontWeight:600,color:'#475569',gridColumn:'1 / -1' }}>
                        Description *
                        <textarea
                          rows={4}
                          style={{ padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit',fontWeight:400,background:'#fff',color:'#0f172a',width:'100%',boxSizing:'border-box',resize:'vertical' }}
                          placeholder="What is this course about and what will students learn?"
                          value={addCourseForm.course_description}
                          onChange={(e) => setAddCourseForm((f) => ({ ...f, course_description: e.target.value }))}
                          required
                        />
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="submit" className="approve-btn" disabled={addingCourse}>
                        {addingCourse ? 'Saving...' : 'Save Course'}
                      </button>
                      <button type="button" className="admin-refresh" onClick={() => setAddCourseOpen(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="admin-filters">
                <input
                  type="search"
                  placeholder="Search course or college..."
                  value={courseSearch}
                  onChange={(event) =>
                    setCourseSearch(event.target.value)
                  }
                />

                <select
                  value={courseFilter}
                  onChange={(event) =>
                    setCourseFilter(event.target.value)
                  }
                >
                  <option value="all">All courses</option>
                  <option value="pending">
                    Awaiting publication
                  </option>
                  <option value="published">Published</option>
                </select>
              </div>

              {coursesLoading ? (
                <p className="admin-empty">
                  Loading courses...
                </p>
              ) : courseError && courses.length === 0 ? (
                <p className="admin-empty">
                  Could not load courses. Check the courses table,
                  column names, foreign key relationship, and
                  SELECT permissions.
                </p>
              ) : filteredCourses.length === 0 ? (
                <p className="admin-empty">
                  No matching courses found. Select All courses
                  and refresh.
                </p>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>College</th>
                        <th>Duration</th>
                        <th>Seats</th>
                        <th>Annual Fee</th>
                        <th>Total Fee</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredCourses.map((course) => {
                        const isUpdating =
                          courseUpdatingId === course.id

                        const isLinkedCourse =
                          Boolean(course.college_id)

                        const collegePublished =
                          course.colleges?.is_published === true

                        // Standalone courses may publish directly.
                        // Linked courses require a published college.
                        const canPublish =
                          !isLinkedCourse || collegePublished

                        return (
                          <tr key={course.id}>
                            <td>
                              <strong>
                                {course.name || 'Unnamed course'}
                              </strong>

                              <small>
                                {course.degree_level ||
                                  'Degree not specified'}
                              </small>

                              {course.course_description && (
                                <small>
                                  {course.course_description}
                                </small>
                              )}
                            </td>

                            <td>
                              <strong>
                                {course.colleges?.name ||
                                  (isLinkedCourse
                                    ? 'College details unavailable'
                                    : 'Standalone course')}
                              </strong>

                              <small>
                                {[
                                  course.colleges?.city,
                                  course.colleges?.state,
                                ]
                                  .filter(Boolean)
                                  .join(', ') || '—'}
                              </small>

                              {isLinkedCourse &&
                                !collegePublished && (
                                  <small className="admin-warning-text">
                                    College is not published
                                  </small>
                                )}
                            </td>

                            <td>
                              {course.duration_years
                                ? `${course.duration_years} years`
                                : '—'}
                            </td>

                            <td>
                              {course.total_seats ?? '—'}
                            </td>

                            <td>
                              {formatMoney(course.annual_fee)}
                            </td>

                            <td>
                              {formatMoney(course.total_fee)}
                            </td>

                            <td>
                              <span
                                className={`admin-status ${course.is_published
                                  ? 'approved'
                                  : 'pending'
                                  }`}
                              >
                                {course.is_published
                                  ? 'Published'
                                  : 'Awaiting publication'}
                              </span>
                            </td>

                            <td>
                              <div className="admin-actions">
                                {course.is_published ? (
                                  <button
                                    type="button"
                                    className="reject-btn"
                                    disabled={isUpdating}
                                    onClick={() =>
                                      handleUpdateCourse(
                                        course,
                                        false
                                      )
                                    }
                                  >
                                    {isUpdating
                                      ? 'Saving...'
                                      : 'Unpublish'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="approve-btn"
                                    disabled={
                                      isUpdating || !canPublish
                                    }
                                    title={
                                      !canPublish
                                        ? 'Publish the associated college first'
                                        : 'Publish this course'
                                    }
                                    onClick={() =>
                                      handleUpdateCourse(
                                        course,
                                        true
                                      )
                                    }
                                  >
                                    {isUpdating
                                      ? 'Publishing...'
                                      : !canPublish
                                        ? 'Publish College First'
                                        : 'Publish Course'}
                                  </button>
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
            </section>
          )}

          {/* USER MANAGEMENT */}
          {activePage === 'users' && (
            <section className="admin-panel">
              <div className="admin-users-heading">
                <div>
                  <h3>User Management</h3>
                  <p>
                    Review accounts and manage user access.
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-refresh"
                  onClick={loadProfiles}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh Users'}
                </button>
              </div>

              {error && (
                <div
                  className="admin-message error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="admin-filters">
                <input
                  type="search"
                  placeholder="Search name, email or user ID..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />

                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value)
                  }
                >
                  <option value="all">All accounts</option>
                  <option value="student">Students</option>
                  <option value="coordinator">Coordinators</option>
                  <option value="admin">Admins</option>
                  <option value="pending">Pending approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {loading ? (
                <p className="admin-empty">
                  Loading accounts...
                </p>
              ) : error && profiles.length === 0 ? (
                <p className="admin-empty">
                  Unable to load accounts. Check Supabase
                  permissions.
                </p>
              ) : filteredProfiles.length === 0 ? (
                <p className="admin-empty">
                  No matching accounts found.
                </p>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredProfiles.map((profile) => {
                        const isSelf =
                          profile.id === user?.id

                        const isUpdating =
                          updatingId === profile.id

                        return (
                          <tr key={profile.id}>
                            <td>
                              <strong>
                                {profile.full_name ||
                                  'Unnamed user'}
                              </strong>

                              <small>
                                {profile.email ||
                                  'No email recorded'}
                              </small>

                              {isSelf && (
                                <small>Your account</small>
                              )}

                              {profile.role === 'coordinator' && (
                                <small>
                                  {profile.college_id
                                    ? `College: ${colleges.find((college) => String(college.id) === String(profile.college_id))?.name || 'assigned'}`
                                    : profile.requested_college_name
                                      ? `Requested (not listed): ${profile.requested_college_name}${profile.requested_college_city ? `, ${profile.requested_college_city}` : ''}`
                                      : profile.requested_college_id
                                        ? `Requested: ${colleges.find((college) => String(college.id) === String(profile.requested_college_id))?.name || 'a college'}`
                                        : 'No college yet'}
                                  {profile.phone ? ` · ${profile.phone}` : ''}
                                </small>
                              )}
                            </td>

                            <td>
                              <span className="admin-role">
                                {profile.role || '—'}
                              </span>
                            </td>

                            <td>
                              <span
                                className={`admin-status ${profile.approval_status ||
                                  'pending'
                                  }`}
                              >
                                {profile.approval_status ||
                                  'Unknown'}
                              </span>
                            </td>

                            <td>
                              {profile.created_at
                                ? new Date(
                                  profile.created_at
                                ).toLocaleDateString()
                                : '—'}
                            </td>

                            <td>
                              <div className="admin-actions">
                                {profile.role === 'coordinator' ? (
                                  (profile.approval_status !== 'approved' ||
                                    !profile.college_id) && (
                                    <button
                                      type="button"
                                      className="approve-btn"
                                      disabled={isUpdating}
                                      onClick={() => openAssign(profile)}
                                    >
                                      {profile.approval_status === 'approved'
                                        ? 'Assign college'
                                        : 'Approve & assign college'}
                                    </button>
                                  )
                                ) : (
                                  profile.approval_status !== 'approved' && (
                                    <button
                                      type="button"
                                      className="approve-btn"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        updateProfile(profile, {
                                          approval_status: 'approved',
                                        })
                                      }
                                    >
                                      Approve
                                    </button>
                                  )
                                )}

                                {profile.role === 'coordinator' &&
                                  profile.approval_status === 'approved' &&
                                  profile.college_id && (
                                    <button
                                      type="button"
                                      className="role-btn"
                                      disabled={isUpdating}
                                      onClick={() => openAssign(profile)}
                                    >
                                      Change college
                                    </button>
                                  )}

                                {profile.approval_status !==
                                  'rejected' && (
                                    <button
                                      type="button"
                                      className="reject-btn"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        profile.role === 'coordinator'
                                          ? rejectCoordinator(profile)
                                          : updateProfile(profile, {
                                            approval_status: 'rejected',
                                          })
                                      }
                                    >
                                      Reject
                                    </button>
                                  )}

                                {!isSelf &&
                                  profile.role === 'student' && (
                                    <button
                                      type="button"
                                      className="role-btn"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        updateProfile(profile, {
                                          role: 'coordinator',
                                        })
                                      }
                                    >
                                      Make Coordinator
                                    </button>
                                  )}

                                {!isSelf &&
                                  profile.role ===
                                  'coordinator' && (
                                    <button
                                      type="button"
                                      className="role-btn"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        updateProfile(profile, {
                                          role: 'student',
                                        })
                                      }
                                    >
                                      Make Student
                                    </button>
                                  )}

                                {isUpdating && (
                                  <span>Saving...</span>
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
            </section>
          )}

          {/* APPROVE COORDINATOR + ASSIGN COLLEGE */}
          {assignTarget && (
            <div
              className="wf-modal-backdrop"
              onClick={() => !assigning && setAssignTarget(null)}
            >
              <form
                className="wf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="assign-title"
                onClick={(event) => event.stopPropagation()}
                onSubmit={submitAssign}
              >
                <h3 id="assign-title">
                  {assignTarget.approval_status === 'approved'
                    ? 'Change coordinator’s college'
                    : 'Approve coordinator'}
                </h3>

                <p>
                  <strong>{assignTarget.full_name || assignTarget.email}</strong>{' '}
                  will be able to edit <em>one</em> college. Each college can
                  have only one coordinator.
                </p>

                <label>
                  College

                  <select
                    value={assignForm.collegeId}
                    onChange={(event) =>
                      setAssignForm((previous) => ({
                        ...previous,
                        collegeId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Select a college</option>

                    {colleges.map((college) => {
                      const owner = profiles.find(
                        (profile) =>
                          profile.role === 'coordinator' &&
                          profile.id !== assignTarget.id &&
                          String(profile.college_id) === String(college.id)
                      )

                      return (
                        <option
                          key={college.id}
                          value={String(college.id)}
                          disabled={Boolean(owner)}
                        >
                          {college.name}
                          {college.city ? ` — ${college.city}` : ''}
                          {owner ? ` (coordinator: ${owner.full_name || owner.email})` : ''}
                        </option>
                      )
                    })}

                    <option value="__new__">＋ Create a new college…</option>
                  </select>
                </label>

                {assignForm.collegeId === '__new__' && (
                  <>
                    <label>
                      New college name

                      <input
                        type="text"
                        value={assignForm.newName}
                        onChange={(event) =>
                          setAssignForm((previous) => ({
                            ...previous,
                            newName: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>

                    <div className="wf-modal-row">
                      <label>
                        City

                        <input
                          type="text"
                          value={assignForm.newCity}
                          onChange={(event) =>
                            setAssignForm((previous) => ({
                              ...previous,
                              newCity: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        State

                        <input
                          type="text"
                          value={assignForm.newState}
                          onChange={(event) =>
                            setAssignForm((previous) => ({
                              ...previous,
                              newState: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <p className="wf-hint">
                      The new college starts unpublished. Publish it from College
                      Management once it is ready.
                    </p>
                  </>
                )}

                <div className="wf-modal-actions">
                  <button
                    type="button"
                    className="role-btn"
                    disabled={assigning}
                    onClick={() => setAssignTarget(null)}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="approve-btn" disabled={assigning}>
                    {assigning ? 'Saving…' : 'Approve & assign'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* FOOTER */}
          <footer className="admin-footer">
            <span>CourseCompass Admin Portal</span>
            <span>College discovery &amp; management</span>
          </footer>
        </main>
      </div>
    </div>
  )
}