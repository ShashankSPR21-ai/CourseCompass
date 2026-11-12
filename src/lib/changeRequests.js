// Shared definitions for the "coordinator edits → admin approves" workflow.
// Used by BOTH the coordinator dashboard (to build a change) and the admin
// dashboard (to show exactly what changed).

export const STREAMS = [
  { id: 1, name: 'Engineering' },
  { id: 2, name: 'Medical' },
  { id: 3, name: 'Commerce' },
  { id: 4, name: 'Science' },
  { id: 5, name: 'Law' },
  { id: 6, name: 'Design' },
]

export const OPEN_STATUSES = ['draft', 'pending', 'rejected']

// type: text | longtext | url | number | money | percent | bool | list | image | images | stream
export const COLLEGE_FIELDS = [
  { key: 'name', label: 'College name', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'institution_type', label: 'Institution type', type: 'text' },
  { key: 'established_year', label: 'Established year', type: 'number' },
  { key: 'nirf_rank', label: 'NIRF rank', type: 'number' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'address', label: 'Address', type: 'longtext' },
  { key: 'description', label: 'Description', type: 'longtext' },
  { key: 'latitude', label: 'Latitude', type: 'number' },
  { key: 'longitude', label: 'Longitude', type: 'number' },
  { key: 'campus_area_acres', label: 'Campus area (acres)', type: 'number' },
  { key: 'logo_url', label: 'Logo', type: 'image' },
  { key: 'cover_url', label: 'Cover photo', type: 'image' },
  { key: 'gallery_urls', label: 'Photo gallery', type: 'images' },
  { key: 'tuition_fee_annual', label: 'Annual fee', type: 'money' },
  { key: 'other_fee_annual', label: 'Other annual fees', type: 'money' },
  { key: 'hostel_available', label: 'Hostel available', type: 'bool' },
  { key: 'hostel_fee_annual', label: 'Annual hostel fee', type: 'money' },
  { key: 'hostel_details', label: 'Hostel details', type: 'longtext' },
  { key: 'infrastructure', label: 'Infrastructure', type: 'list' },
  { key: 'avg_package_lpa', label: 'Average package (LPA)', type: 'number' },
  { key: 'highest_package_lpa', label: 'Highest package (LPA)', type: 'number' },
  { key: 'placement_rate', label: 'Placement rate', type: 'percent' },
  { key: 'top_recruiters', label: 'Top recruiters', type: 'list' },
]

export const COURSE_FIELDS = [
  { key: 'name', label: 'Course name', type: 'text' },
  { key: 'stream_id', label: 'Stream', type: 'stream' },
  { key: 'degree_level', label: 'Degree level', type: 'text' },
  { key: 'duration_years', label: 'Duration (years)', type: 'number' },
  { key: 'total_seats', label: 'Total seats', type: 'number' },
  { key: 'annual_fee', label: 'Annual fee', type: 'money' },
  { key: 'total_fee', label: 'Total fee', type: 'money' },
  { key: 'course_description', label: 'Description', type: 'longtext' },
]

// Cutoff rows (table: college_programs). Cutoffs are ranks: a LOWER number is harder to get.
export const PROGRAM_FIELDS = [
  { key: 'branch', label: 'Branch', type: 'text' },
  { key: 'exam', label: 'Entrance exam', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'annual_fee', label: 'Annual fee', type: 'money' },
  { key: 'cutoff_rank', label: 'Cutoff rank / marks', type: 'number' },
  { key: 'cutoff_year', label: 'Cutoff year', type: 'number' },
  { key: 'cutoff_round', label: 'Cutoff round', type: 'text' },
  { key: 'cutoff_source_url', label: 'Source link', type: 'url' },
]

export function fieldsFor(entity) {
  if (entity === 'course') return COURSE_FIELDS
  if (entity === 'program') return PROGRAM_FIELDS
  return COLLEGE_FIELDS
}

// ---------------------------------------------------------------------------

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function normalise(type, value) {
  if (isEmpty(value)) return type === 'bool' ? false : null

  switch (type) {
    case 'number':
    case 'money':
    case 'percent':
    case 'stream': {
      const n = Number(value)
      return Number.isFinite(n) ? n : String(value).trim()
    }
    case 'bool':
      return Boolean(value)
    case 'list':
    case 'images':
      return (Array.isArray(value) ? value : String(value).split(','))
        .map((item) => String(item).trim())
        .filter(Boolean)
    default:
      return String(value).trim()
  }
}

export function sameValue(type, a, b) {
  return JSON.stringify(normalise(type, a)) === JSON.stringify(normalise(type, b))
}

// Only the keys that actually differ from `base`.
export function changedFields(entity, base, next) {
  const result = {}

  for (const field of fieldsFor(entity)) {
    if (!(field.key in next)) continue
    if (!sameValue(field.type, base?.[field.key], next[field.key])) {
      result[field.key] = next[field.key] ?? null
    }
  }

  return result
}

export function formatValue(field, value) {
  if (isEmpty(value)) return field.type === 'bool' ? 'No' : '—'

  switch (field.type) {
    case 'money': {
      const n = Number(value)
      return Number.isFinite(n)
        ? n.toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
          })
        : String(value)
    }
    case 'percent':
      return `${value}%`
    case 'bool':
      return value ? 'Yes' : 'No'
    case 'list':
      return normalise('list', value).join(', ')
    case 'stream':
      return STREAMS.find((s) => s.id === Number(value))?.name || String(value)
    case 'images':
      return `${normalise('images', value).length} photo(s)`
    default:
      return String(value)
  }
}

// [{ key, label, type, before, after }]  – `before`/`after` are RAW values
export function buildDiff(entity, current, payload) {
  const rows = []

  for (const field of fieldsFor(entity)) {
    if (!payload || !(field.key in payload)) continue

    const before = current?.[field.key]
    const after = payload[field.key]

    if (!sameValue(field.type, before, after)) {
      rows.push({ ...field, before, after })
    }
  }

  return rows
}

export function summariseChange(entity, action, name, payload) {
  if (entity === 'program') {
    if (action === 'create') return `New cutoff: ${name || 'Untitled'}`
    if (action === 'delete') return `Remove cutoff: ${name || 'Untitled'}`
    const labels = PROGRAM_FIELDS.filter((f) => payload && f.key in payload).map((f) => f.label)
    return labels.length ? `Edit cutoff "${name}": ${labels.join(', ')}` : `Edit cutoff "${name}"`
  }

  if (entity === 'course') {
    if (action === 'create') return `New course: ${name || 'Untitled'}`
    if (action === 'delete') return `Remove course: ${name || 'Untitled'}`
  }

  const labels = fieldsFor(entity)
    .filter((field) => payload && field.key in payload)
    .map((field) => field.label)

  const prefix = entity === 'course' ? `Edit course "${name}"` : 'College details'

  return labels.length ? `${prefix}: ${labels.join(', ')}` : prefix
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export const STATUS_LABELS = {
  draft: 'Draft – not submitted',
  pending: 'Waiting for admin approval',
  approved: 'Approved',
  rejected: 'Rejected',
}
