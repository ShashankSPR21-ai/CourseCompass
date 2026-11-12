import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import './CoordinatorDashboard.css';
import './workflow.css';
import MenuButton from './MenuButton';
import { CollegeLogo } from './CollegeVisual';
import { useDrawer } from './lib/useDrawer';
import {
  OPEN_STATUSES,
  STATUS_LABELS,
  STREAMS,
  changedFields,
  formatDate,
  summariseChange,
} from './lib/changeRequests';

function getNowIso() {
  return new Date().toISOString();
}

const DEGREE_LEVELS = [
  'undergraduate',
  'postgraduate',
  'diploma',
  'doctoral',
];

const emptyCollege = {
  name: '',
  city: '',
  state: 'Karnataka',
  address: '',
  website: '',
  institution_type: '',
  description: '',
  established_year: '',
  logo_url: '',
  cover_url: '',
  gallery_urls: [],
  latitude: '',
  longitude: '',
  nirf_rank: '',
  campus_area_acres: '',
  infrastructure: '',
  hostel_available: false,
  hostel_details: '',
  hostel_fee_annual: '',
  tuition_fee_annual: '',
  other_fee_annual: '',
  avg_package_lpa: '',
  highest_package_lpa: '',
  placement_rate: '',
  top_recruiters: '',
};

const emptyProgram = {
  course_id: '',
  branch: '',
  exam: 'KCET',
  category: 'GM',
  annual_fee: '',
  cutoff_rank: '',
  cutoff_year: String(new Date().getFullYear()),
  cutoff_round: '',
  cutoff_source_url: '',
};

const EXAM_SUGGESTIONS = ['KCET', 'COMEDK', 'JEE Main', 'NEET', 'Management'];
const CATEGORY_SUGGESTIONS = ['GM', '1G', '2AG', '2BG', '3AG', '3BG', 'SCG', 'STG', 'General', 'OBC', 'SC', 'ST'];

const emptyCourse = {
  college_id: '',
  name: '',
  degree_level: 'undergraduate',
  duration_years: '',
  duration: '',
  stream_id: '',
  total_seats: '',
  annual_fee: '',
  total_fee: '',
  course_description: '',
};

// A cutoff row created automatically for a course, still waiting for its numbers.
function isEmptyCutoff(program) {
  return Boolean(program) && program.cutoff_rank == null;
}

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function messageFromError(error) {
  console.error('CourseCompass database error:', error);

  if (error?.code === '42501') {
    return `Permission denied by Supabase. Check Row-Level Security policies. ${error.message}`;
  }

  if (error?.code === '23505') {
    return `A duplicate record already exists. ${error.message}`;
  }

  if (error?.code === '23503') {
    return `A related record does not exist. ${error.message}`;
  }

  if (error?.code === '23502') {
    return `Required database field "${error.column || 'unknown'}" is missing. ${error.message}`;
  }

  if (error?.code === '22P02') {
    return `An invalid value was supplied to the database. ${error.message}`;
  }

  if (error?.code === '42703' || error?.code === 'PGRST204') {
    return `A database column is missing or unavailable. ${error.message}`;
  }

  return error?.message || 'Something went wrong. Please try again.';
}

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .join(', ');
  }

  return typeof value === 'string' ? value : '';
}

function money(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not specified';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return 'Not specified';

  return number.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
  min,
  max,
  step,
}) {
  return (
    <label className="co-label">
      {label}
      {required ? ' *' : ''}

      <input
        className="co-input"
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder = '',
  rows = 4,
  required = false,
}) {
  return (
    <label className="co-label">
      {label}
      {required ? ' *' : ''}

      <textarea
        className="co-input"
        style={{
          minHeight: rows * 24,
          resize: 'vertical',
        }}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
      />
    </label>
  );
}

function FormGrid({ children, className }) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '0 16px',
      }}
    >
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}) {
  return (
    <label className="co-label">
      {label}
      {required ? ' *' : ''}

      <select
        className="co-input"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Select {label.toLowerCase()}</option>

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// College <-> form conversion
// ---------------------------------------------------------------------------

function collegeToForm(college) {
  return {
    ...emptyCollege,
    name: safeText(college.name),
    city: safeText(college.city),
    state: safeText(college.state) || 'Karnataka',
    address: safeText(college.address),
    website: safeText(college.website),
    institution_type: safeText(college.institution_type),
    description: safeText(college.description),
    established_year: college.established_year ?? '',
    logo_url: safeText(college.logo_url),
    cover_url: safeText(college.cover_url),
    gallery_urls: Array.isArray(college.gallery_urls) ? college.gallery_urls : [],
    latitude: college.latitude ?? '',
    longitude: college.longitude ?? '',
    nirf_rank: college.nirf_rank ?? '',
    campus_area_acres: college.campus_area_acres ?? '',
    infrastructure: listText(college.infrastructure),
    hostel_available: Boolean(college.hostel_available),
    hostel_details: safeText(college.hostel_details),
    hostel_fee_annual: college.hostel_fee_annual ?? '',
    tuition_fee_annual: college.tuition_fee_annual ?? college.annual_fee ?? '',
    other_fee_annual: college.other_fee_annual ?? '',
    avg_package_lpa: college.avg_package_lpa ?? '',
    highest_package_lpa: college.highest_package_lpa ?? '',
    placement_rate: college.placement_rate ?? '',
    top_recruiters: listText(college.top_recruiters),
  };
}

function formToPayload(form) {
  const text = (value) => safeText(value).trim() || null;

  return {
    name: safeText(form.name).trim(),
    city: safeText(form.city).trim(),
    state: safeText(form.state).trim() || 'Karnataka',
    address: text(form.address),
    website: text(form.website),
    institution_type: text(form.institution_type),
    description: text(form.description),
    established_year: nullableNumber(form.established_year),
    logo_url: text(form.logo_url),
    cover_url: text(form.cover_url),
    gallery_urls: Array.isArray(form.gallery_urls) ? form.gallery_urls : [],
    latitude: nullableNumber(form.latitude),
    longitude: nullableNumber(form.longitude),
    nirf_rank: nullableNumber(form.nirf_rank),
    campus_area_acres: nullableNumber(form.campus_area_acres),
    infrastructure: splitList(form.infrastructure),
    hostel_available: Boolean(form.hostel_available),
    hostel_details: text(form.hostel_details),
    hostel_fee_annual: nullableNumber(form.hostel_fee_annual),
    tuition_fee_annual: nullableNumber(form.tuition_fee_annual),
    other_fee_annual: nullableNumber(form.other_fee_annual),
    avg_package_lpa: nullableNumber(form.avg_package_lpa),
    highest_package_lpa: nullableNumber(form.highest_package_lpa),
    placement_rate: nullableNumber(form.placement_rate),
    top_recruiters: splitList(form.top_recruiters),
  };
}

function programToForm(program) {
  return {
    ...emptyProgram,
    course_id: program.course_id != null ? String(program.course_id) : '',
    branch: safeText(program.branch),
    exam: safeText(program.exam),
    category: safeText(program.category),
    annual_fee: program.annual_fee ?? '',
    cutoff_rank: program.cutoff_rank ?? '',
    cutoff_year: program.cutoff_year ?? '',
    cutoff_round: safeText(program.cutoff_round),
    cutoff_source_url: safeText(program.cutoff_source_url),
  };
}

function courseToForm(course) {
  return {
    ...emptyCourse,
    name: safeText(course.name),
    degree_level: safeText(course.degree_level) || 'undergraduate',
    duration_years: course.duration_years ?? '',
    duration:
      safeText(course.duration) ||
      (course.duration_years ? `${course.duration_years} years` : ''),
    stream_id: course.stream_id ?? '',
    total_seats: course.total_seats ?? '',
    annual_fee: course.annual_fee ?? '',
    total_fee: course.total_fee ?? '',
    course_description: safeText(course.course_description),
  };
}

// ---------------------------------------------------------------------------
// Photos (stored in the "college-photos" bucket, inside this college's folder)
// ---------------------------------------------------------------------------

const MAX_GALLERY = 12;

async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Only JPG, PNG or WebP images are allowed.');
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('That image is too large (maximum 20 MB).');
  }

  // Shrink big phone/camera photos in the browser so pages load fast.
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85)
    );

    if (blob && blob.size < file.size) {
      return { blob, type: 'image/webp', ext: 'webp' };
    }
  } catch {
    // fall back to the original file below
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be under 5 MB.');
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob: file, type: file.type, ext };
}

function PhotoPicker({ label, hint, urls, multiple = false, busy, onFiles, onRemove, max = 1 }) {
  const inputId = `photo-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const canAdd = urls.length < max;

  return (
    <div className="wf-photo-field">
      <span className="co-label">{label}</span>
      {hint && <small className="wf-hint">{hint}</small>}

      <div className="wf-photo-grid">
        {urls.map((url, index) => (
          <figure key={`${url}-${index}`} className="wf-photo">
            <img src={url} alt={`${label} ${index + 1}`} loading="lazy" />

            <button
              type="button"
              className="wf-photo-remove"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => onRemove(index)}
            >
              ×
            </button>
          </figure>
        ))}

        {canAdd && (
          <label className={`wf-photo-add${busy ? ' busy' : ''}`} htmlFor={inputId}>
            <span aria-hidden="true">{busy ? '…' : '+'}</span>
            <small>{busy ? 'Uploading…' : multiple ? 'Add photos' : urls.length ? 'Replace' : 'Choose photo'}</small>

            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={multiple}
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                if (files.length) onFiles(files);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, children }) {
  return <span className={`wf-pill wf-pill-${status}`}>{children}</span>;
}

// ---------------------------------------------------------------------------

export default function CoordinatorDashboard({ user, onLogout }) {
  const [section, setSection] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [college, setCollege] = useState(null);
  const [courses, setCourses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [changes, setChanges] = useState([]);

  const [collegeForm, setCollegeForm] = useState({ ...emptyCollege });
  const [courseForm, setCourseForm] = useState({ ...emptyCourse });
  const [replyDrafts, setReplyDrafts] = useState({});
  const [programForm, setProgramForm] = useState({ ...emptyProgram });
  // { programId, requestId } – which live cutoff row / pending request is being edited
  const [editingProgram, setEditingProgram] = useState(null);
  const [publishIssue, setPublishIssue] = useState('');
  const drawer = useDrawer();
  // { courseId, requestId } – which live course / pending request is being edited
  const [editingCourse, setEditingCourse] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [uploading, setUploading] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: me, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email, role, approval_status, college_id, requested_college_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!me) throw new Error('Your profile could not be found.');

      if (me.role !== 'coordinator') {
        throw new Error('Your account is not authorized for this dashboard.');
      }

      setProfile(me);

      // Not approved yet / no college assigned yet → nothing else to load.
      if (me.approval_status !== 'approved' || !me.college_id) {
        setCollege(null);
        return;
      }

      const [collegeResult, courseResult, requestResult, changeResult, programResult] =
        await Promise.all([
          supabase.from('colleges').select('*').eq('id', me.college_id).maybeSingle(),

          supabase
            .from('courses')
            .select('*')
            .eq('college_id', me.college_id)
            .order('created_at', { ascending: false }),

          supabase
            .from('student_requests')
            .select('*, colleges(name)')
            .eq('college_id', me.college_id)
            .order('created_at', { ascending: false }),

          supabase
            .from('change_requests')
            .select('*')
            .eq('college_id', me.college_id)
            .order('updated_at', { ascending: false })
            .limit(100),

          supabase
            .from('college_programs')
            .select('*')
            .eq('college_id', me.college_id)
            .limit(500),
        ]);

      if (collegeResult.error) throw collegeResult.error;
      if (courseResult.error) throw courseResult.error;
      if (requestResult.error) throw requestResult.error;
      if (changeResult.error) throw changeResult.error;
      if (programResult.error) throw programResult.error;

      const live = collegeResult.data;
      const allChanges = changeResult.data || [];

      if (!live) throw new Error('Your college could not be found.');

      const openCollegeChange = allChanges.find(
        (change) =>
          change.entity === 'college' && OPEN_STATUSES.includes(change.status)
      );

      setCollege(live);
      setCourses(courseResult.data || []);
      setPrograms(programResult.data || []);
      setRequests(requestResult.data || []);
      setChanges(allChanges);

      // The form shows the live data with any saved draft / pending edits on top.
      setCollegeForm(
        collegeToForm({ ...live, ...(openCollegeChange?.payload || {}) })
      );
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!active) return;
      await loadData();
    }

    initialize();

    return () => {
      active = false;
    };
  }, [loadData]);

  function notify(text) {
    setNotice(text);
    setError('');
  }

  function clearMessages() {
    setNotice('');
    setError('');
    setPublishIssue('');
  }

  function setCollegeField(field, value) {
    setCollegeForm((previous) => ({ ...previous, [field]: value }));
  }

  function setProgramField(field, value) {
    setProgramForm((previous) => ({ ...previous, [field]: value }));
  }

  // Choosing a course links the cutoff to it; the branch always follows the course name.
  function chooseProgramCourse(courseId) {
    const course = courses.find((item) => String(item.id) === String(courseId));
    setProgramForm((previous) => ({
      ...previous,
      course_id: courseId,
      branch: course ? course.name : previous.branch,
    }));
  }

  function setCourseField(field, value) {
    setCourseForm((previous) => ({ ...previous, [field]: value }));
  }

  const openCollegeChange = changes.find(
    (change) => change.entity === 'college' && OPEN_STATUSES.includes(change.status)
  );

  const openCourseChanges = changes.filter(
    (change) => change.entity === 'course' && OPEN_STATUSES.includes(change.status)
  );

  const openProgramChanges = changes.filter(
    (change) => change.entity === 'program' && OPEN_STATUSES.includes(change.status)
  );

  const pendingCount = changes.filter((change) => change.status === 'pending').length;
  const rejectedCount = changes.filter((change) => change.status === 'rejected').length;

  // ----- Photos ------------------------------------------------------------

  async function uploadImage(file, prefix) {
    const { blob, type, ext } = await prepareImage(file);
    const path = `${college.id}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('college-photos')
      .upload(path, blob, { contentType: type, cacheControl: '31536000' });

    if (uploadError) throw uploadError;

    return supabase.storage.from('college-photos').getPublicUrl(path).data.publicUrl;
  }

  async function handleSinglePhoto(field, prefix, files) {
    clearMessages();
    setUploading(field);

    try {
      const url = await uploadImage(files[0], prefix);
      setCollegeField(field, url);
      notify('Photo uploaded. Remember to submit your changes for review.');
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setUploading('');
    }
  }

  async function handleGalleryPhotos(files) {
    clearMessages();

    const room = MAX_GALLERY - collegeForm.gallery_urls.length;

    if (room <= 0) {
      setError(`The gallery can hold up to ${MAX_GALLERY} photos.`);
      return;
    }

    setUploading('gallery_urls');

    try {
      const added = [];

      for (const file of files.slice(0, room)) {
        added.push(await uploadImage(file, 'gallery'));
      }

      setCollegeForm((previous) => ({
        ...previous,
        gallery_urls: [...previous.gallery_urls, ...added],
      }));

      notify(
        `${added.length} photo${added.length > 1 ? 's' : ''} uploaded. Remember to submit your changes for review.`
      );
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setUploading('');
    }
  }

  // ----- Change requests ----------------------------------------------------

  // After saving, find out whether the database published it instantly
  // (script 003) or whether it is waiting for the admin.
  async function wasPublished(entity, entityId) {
    let query = supabase
      .from('change_requests')
      .select('status, admin_note')
      .eq('college_id', college.id)
      .eq('entity', entity)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (entityId) query = query.eq('entity_id', String(entityId));

    const { data } = await query;
    const latest = data?.[0];

    if (latest?.status === 'approved') {
      setPublishIssue('');
      return true;
    }

    // Instant publishing is switched off, not installed, or it failed – say which.
    setPublishIssue(
      latest?.admin_note?.startsWith('Auto-publish failed')
        ? latest.admin_note
        : ''
    );
    return false;
  }

  async function writeChange({ existing, entity, action, entityId, payload, status, summary }) {
    const result = existing
      ? await supabase
        .from('change_requests')
        .update({ payload, status, summary })
        .eq('id', existing.id)
        .select('id')
      : await supabase
        .from('change_requests')
        .insert({
          college_id: college.id,
          entity,
          action,
          entity_id: entityId ?? null,
          payload,
          status,
          summary,
        })
        .select('id');

    if (result.error) throw result.error;

    if (!result.data?.length) {
      throw new Error('The change could not be saved. Please try again.');
    }
  }

  // mode: 'draft' (keep private) | 'pending' (send to the admin)
  async function saveCollege(mode) {
    clearMessages();

    const next = formToPayload(collegeForm);

    if (!next.name || !next.city) {
      setError('College name and city are required.');
      return;
    }

    const numericFields = [
      ['Established year', next.established_year, 1800, 2200],
      ['Latitude', next.latitude, -90, 90],
      ['Longitude', next.longitude, -180, 180],
      ['NIRF rank', next.nirf_rank, 1, 100000],
      ['Campus area', next.campus_area_acres, 0, 1000000],
      ['Hostel fee', next.hostel_fee_annual, 0, 100000000],
      ['Annual fee', next.tuition_fee_annual, 0, 100000000],
      ['Other fees', next.other_fee_annual, 0, 100000000],
      ['Average package', next.avg_package_lpa, 0, 1000000],
      ['Highest package', next.highest_package_lpa, 0, 1000000],
      ['Placement rate', next.placement_rate, 0, 100],
    ];

    for (const [label, value, min, max] of numericFields) {
      if (value === null) continue;

      if (!Number.isFinite(value) || value < min || value > max) {
        setError(`${label} must be between ${min} and ${max}.`);
        return;
      }
    }

    if (
      next.avg_package_lpa !== null &&
      next.highest_package_lpa !== null &&
      next.avg_package_lpa > next.highest_package_lpa
    ) {
      setError('Average package cannot exceed the highest package.');
      return;
    }

    // Only send what actually differs from the live page.
    const baseline = formToPayload(collegeToForm(college));
    const payload = changedFields('college', baseline, next);

    if (!Object.keys(payload).length) {
      if (openCollegeChange && openCollegeChange.status !== 'pending') {
        // Everything was reverted – drop the draft.
        setSaving(true);
        try {
          const { error: deleteError } = await supabase
            .from('change_requests')
            .delete()
            .eq('id', openCollegeChange.id);
          if (deleteError) throw deleteError;
          notify('Your draft was discarded because it matches the live page.');
          await loadData();
        } catch (err) {
          setError(messageFromError(err));
        } finally {
          setSaving(false);
        }
        return;
      }

      setError(
        openCollegeChange
          ? 'Your submission matches the live page. Withdraw it if you no longer want it reviewed.'
          : 'You have not changed anything yet.'
      );
      return;
    }

    setSaving(true);

    try {
      await writeChange({
        existing: openCollegeChange,
        entity: 'college',
        action: 'update',
        payload,
        status: mode,
        summary: summariseChange('college', 'update', college.name, payload),
      });

      const published = mode === 'pending' && (await wasPublished('college'));

      notify(
        mode === 'pending'
          ? published
            ? '✅ Published! Students can see your changes now.'
            : 'Submitted! Students will see your changes only after an administrator approves them.'
          : 'Draft saved. It is not visible to students and has not been sent to the admin yet.'
      );

      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSaving(false);
    }
  }

  async function withdrawChange(change) {
    clearMessages();
    setBusyId(change.id);

    try {
      const { error: updateError } = await supabase
        .from('change_requests')
        .update({ status: 'draft' })
        .eq('id', change.id);

      if (updateError) throw updateError;

      notify('Submission withdrawn. It is saved as a draft.');
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function discardChange(change) {
    if (!window.confirm('Discard this change? This cannot be undone.')) return;

    clearMessages();
    setBusyId(change.id);

    try {
      const { error: deleteError } = await supabase
        .from('change_requests')
        .delete()
        .eq('id', change.id);

      if (deleteError) throw deleteError;

      notify('Change discarded.');
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  // ----- Courses -----------------------------------------------------------

  function startNewCourse() {
    setCourseForm({ ...emptyCourse });
    setEditingCourse(null);
    setSection('courses');
    clearMessages();
  }

  function editLiveCourse(course) {
    const request = openCourseChanges.find(
      (change) => change.entity_id === String(course.id) && change.action === 'update'
    );

    setCourseForm(courseToForm({ ...course, ...(request?.payload || {}) }));
    setEditingCourse({ courseId: course.id, requestId: request?.id || null });
    setSection('courses');
    clearMessages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editNewCourseRequest(request) {
    setCourseForm(courseToForm(request.payload || {}));
    setEditingCourse({ courseId: null, requestId: request.id });
    setSection('courses');
    clearMessages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveCourse(event) {
    event.preventDefault();
    clearMessages();

    const courseName = safeText(courseForm.name).trim();
    const streamId = nullableNumber(courseForm.stream_id);
    const degreeLevel = safeText(courseForm.degree_level).trim();
    const durationYears = nullableNumber(courseForm.duration_years);
    const seats = nullableNumber(courseForm.total_seats);
    const annualFee = nullableNumber(courseForm.annual_fee);
    const totalFee = nullableNumber(courseForm.total_fee);
    const description = safeText(courseForm.course_description).trim();

    if (!courseName) return setError('Enter a course name.');

    if (streamId === null || !STREAMS.some((stream) => stream.id === streamId)) {
      return setError('Please select a valid stream.');
    }

    if (!DEGREE_LEVELS.includes(degreeLevel)) {
      return setError('Please select a valid degree level.');
    }

    if (durationYears === null || !Number.isFinite(durationYears) || durationYears <= 0) {
      return setError('Enter a valid course duration in years, such as 3 or 4.');
    }

    if (seats !== null && (!Number.isInteger(seats) || seats < 0)) {
      return setError('Total seats must be a non-negative whole number.');
    }

    if ([annualFee, totalFee].some((fee) => fee !== null && (!Number.isFinite(fee) || fee < 0))) {
      return setError('Course fees cannot be negative.');
    }

    if (!description) return setError('Enter a course description.');

    const next = {
      name: courseName,
      stream_id: streamId,
      degree_level: degreeLevel,
      duration_years: durationYears,
      duration: safeText(courseForm.duration).trim() || `${durationYears} years`,
      total_seats: seats,
      annual_fee: annualFee,
      total_fee: totalFee,
      course_description: description,
    };

    const liveCourse = editingCourse?.courseId
      ? courses.find((course) => String(course.id) === String(editingCourse.courseId))
      : null;

    const existing = editingCourse?.requestId
      ? changes.find((change) => change.id === editingCourse.requestId)
      : null;

    let payload = next;
    let action = 'create';

    if (liveCourse) {
      action = 'update';
      payload = changedFields('course', courseToForm(liveCourse), next);

      if (!Object.keys(payload).length) {
        return setError('You have not changed anything yet.');
      }

      if ('duration_years' in payload) payload.duration = next.duration;
    }

    setSaving(true);

    try {
      await writeChange({
        existing,
        entity: 'course',
        action,
        entityId: liveCourse ? String(liveCourse.id) : null,
        payload,
        status: 'pending',
        summary: summariseChange('course', action, courseName, payload),
      });

      setCourseForm({ ...emptyCourse });
      setEditingCourse(null);

      notify(
        (await wasPublished('course', liveCourse?.id))
          ? '✅ Course published! Students can see it now.'
          : 'Course submitted! It will appear for students after an administrator approves it.'
      );
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSaving(false);
    }
  }

  async function requestCourseRemoval(course) {
    if (
      !window.confirm(
        `Ask the admin to remove "${course.name}"? It stays visible to students until the admin approves.`
      )
    ) {
      return;
    }

    clearMessages();
    setBusyId(course.id);

    try {
      // The button is only offered when no change is open for this course.
      await writeChange({
        entity: 'course',
        action: 'delete',
        entityId: String(course.id),
        payload: {},
        status: 'pending',
        summary: summariseChange('course', 'delete', course.name, {}),
      });

      notify(
        (await wasPublished('course', course.id))
          ? '✅ Course removed.'
          : 'Removal requested. The admin will review it.'
      );
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  // ----- Cutoffs -----------------------------------------------------------

  function programLabel(data) {
    return [data.branch, data.exam, data.category].filter(Boolean).join(' · ') || 'Cutoff';
  }

  function startNewProgram() {
    setProgramForm({ ...emptyProgram });
    setEditingProgram(null);
    clearMessages();
  }

  function editLiveProgram(program) {
    const request = openProgramChanges.find(
      (change) => change.entity_id === String(program.id) && change.action === 'update'
    );

    setProgramForm(programToForm({ ...program, ...(request?.payload || {}) }));
    setEditingProgram({ programId: program.id, requestId: request?.id || null });
    clearMessages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // From the Courses page: open this course's cutoff on the Cutoff Marks page.
  function openCourseCutoff(course) {
    const linked = programs
      .filter((program) => String(program.course_id) === String(course.id))
      .sort((x, y) => isEmptyCutoff(y) - isEmptyCutoff(x))[0];

    setSection('cutoffs');
    setSearch('');

    if (linked) {
      editLiveProgram(linked);
    } else {
      setProgramForm({ ...emptyProgram, course_id: String(course.id), branch: course.name });
      setEditingProgram(null);
      clearMessages();
    }
  }

  function editNewProgramRequest(request) {
    setProgramForm(programToForm(request.payload || {}));
    setEditingProgram({ programId: null, requestId: request.id });
    clearMessages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveProgram(event) {
    event.preventDefault();
    clearMessages();

    const branch = safeText(programForm.branch).trim();
    const exam = safeText(programForm.exam).trim();
    const category = safeText(programForm.category).trim();
    const rank = nullableNumber(programForm.cutoff_rank);
    const year = nullableNumber(programForm.cutoff_year);
    const fee = nullableNumber(programForm.annual_fee);
    const source = safeText(programForm.cutoff_source_url).trim();

    if (!branch) return setError('Enter the branch, for example Computer Science.');
    if (!exam) return setError('Enter the entrance exam, for example KCET.');
    if (!category) return setError('Enter the category, for example GM.');

    if (rank === null || !Number.isInteger(rank) || rank <= 0) {
      return setError('Cutoff rank / marks must be a whole number greater than 0.');
    }

    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      return setError('Cutoff year must be a valid year such as 2025.');
    }

    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
      return setError('Annual fee cannot be negative.');
    }

    if (source && !/^https?:\/\//i.test(source)) {
      return setError('The source link must start with http:// or https://');
    }

    const linkedCourse = programForm.course_id
      ? courses.find((course) => String(course.id) === String(programForm.course_id))
      : null;

    const next = {
      ...(linkedCourse ? { course_id: linkedCourse.id } : {}),
      branch,
      exam,
      category,
      annual_fee: fee,
      cutoff_rank: rank,
      cutoff_year: year,
      cutoff_round: safeText(programForm.cutoff_round).trim() || null,
      cutoff_source_url: source || null,
    };

    const liveProgram = editingProgram?.programId
      ? programs.find((program) => String(program.id) === String(editingProgram.programId))
      : null;

    const existing = editingProgram?.requestId
      ? changes.find((change) => change.id === editingProgram.requestId)
      : null;

    let payload = next;
    let action = 'create';

    if (liveProgram) {
      action = 'update';
      payload = changedFields('program', programToForm(liveProgram), next);

      if (!Object.keys(payload).length) {
        return setError('You have not changed anything yet.');
      }
    }

    setSaving(true);

    try {
      await writeChange({
        existing,
        entity: 'program',
        action,
        entityId: liveProgram ? String(liveProgram.id) : null,
        payload,
        status: 'pending',
        summary: summariseChange('program', action, programLabel(next), payload),
      });

      setProgramForm({ ...emptyProgram });
      setEditingProgram(null);

      notify(
        (await wasPublished('program', liveProgram?.id))
          ? '✅ Cutoff published! Students can see it now.'
          : 'Cutoff submitted! Students will see it after an administrator approves it.'
      );
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSaving(false);
    }
  }

  async function requestProgramRemoval(program) {
    if (
      !window.confirm(
        `Ask the admin to remove the cutoff "${programLabel(program)}"? It stays visible until the admin approves.`
      )
    ) {
      return;
    }

    clearMessages();
    setBusyId(`program-${program.id}`);

    try {
      await writeChange({
        entity: 'program',
        action: 'delete',
        entityId: String(program.id),
        payload: {},
        status: 'pending',
        summary: summariseChange('program', 'delete', programLabel(program), {}),
      });

      notify(
        (await wasPublished('program', program.id))
          ? '✅ Cutoff removed.'
          : 'Removal requested. The admin will review it.'
      );
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendReply(request) {
    clearMessages();
    const text = safeText(replyDrafts[request.id] ?? request.reply).trim();
    if (!text) return setError('Type a reply first.');

    setBusyId(request.id);
    try {
      const { error: updateError } = await supabase
        .from('student_requests')
        .update({
          reply: text,
          replied_at: getNowIso(),
          replied_by: user.id,
          status: 'contacted',
          assigned_to: user.id,
          updated_at: getNowIso(),
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      notify('Reply sent. The student can see it now.');
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateRequestStatus(request, status) {
    clearMessages();
    setBusyId(request.id);

    try {
      const { error: updateError } = await supabase
        .from('student_requests')
        .update({ status, assigned_to: user.id, updated_at: getNowIso() })
        .eq('id', request.id);

      if (updateError) throw updateError;

      notify(`Request marked as ${status}.`);
      await loadData();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  // ----- Derived -----------------------------------------------------------

  const searchTerm = safeText(search).toLowerCase();

  const filteredRequests = requests.filter((request) =>
    `${request.student_name || ''} ${request.student_email || ''} ${request.message || ''}`
      .toLowerCase()
      .includes(searchTerm)
  );

  const pendingRequests = requests.filter(
    (request) => (request.status || 'pending') === 'pending'
  ).length;

  const courseRows = [
    ...openCourseChanges
      .filter((change) => change.action === 'create')
      .map((change) => ({ kind: 'new', key: change.id, request: change, data: change.payload || {} })),
    ...courses
      .filter((course) =>
        `${course.name || ''} ${course.degree_level || ''}`.toLowerCase().includes(searchTerm)
      )
      .map((course) => ({
        kind: 'live',
        key: course.id,
        course,
        request: openCourseChanges.find((change) => change.entity_id === String(course.id)),
        data: course,
      })),
  ];

  const programRows = [
    ...openProgramChanges
      .filter((change) => change.action === 'create')
      .map((change) => ({ kind: 'new', key: change.id, request: change, data: change.payload || {} })),
    ...programs
      .filter((program) =>
        `${program.branch || ''} ${program.exam || ''} ${program.category || ''}`
          .toLowerCase()
          .includes(searchTerm)
      )
      .sort((a, b) =>
        (isEmptyCutoff(b) - isEmptyCutoff(a)) ||
        Number(b.cutoff_year || 0) - Number(a.cutoff_year || 0)
      )
      .map((program) => ({
        kind: 'live',
        key: program.id,
        program,
        request: openProgramChanges.find((change) => change.entity_id === String(program.id)),
        // show the coordinator's own pending / draft edit on top of the live row
        data: {
          ...program,
          ...(openProgramChanges.find((change) => change.entity_id === String(program.id) && change.action === 'update')?.payload || {}),
        },
      })),
  ];

  const menuItems = [
    ['overview', '📊 Overview'],
    ['college', '🏫 My College'],
    ['courses', '📚 Courses'],
    ['cutoffs', '🎯 Cutoff Marks'],
    ['requests', '👨‍🎓 Student Requests'],
    ['profile', '👤 My Profile'],
  ];

  // ----- Screens -----------------------------------------------------------

  const header = (
    <header className="co-topbar">
      <div className="co-topbar-left">
        {college && (
          <MenuButton open={drawer.open} onClick={drawer.toggle} />
        )}

        <div className="co-brand">
          <span className="co-brand-mark">C</span>
          <div>
            <strong>CourseCompass</strong>
            <small>Coordinator Control Panel</small>
          </div>
        </div>
      </div>

      <div className="co-topbar-right">
        <span className="co-user">
          <i>{(profile?.full_name || user.email || 'C').charAt(0).toUpperCase()}</i>
          <span>{profile?.full_name || user.email || 'Coordinator'}</span>
        </span>

        <button type="button" className="co-btn co-btn-ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );

  if (loading && !profile) {
    return (
      <div className="coordinator-dashboard-loading" style={{ padding: 40 }}>
        Loading Coordinator Dashboard...
      </div>
    );
  }

  // Waiting-room screens: account pending / rejected / no college yet.
  const gate =
    profile && profile.approval_status === 'rejected'
      ? {
        icon: '🚫',
        title: 'Coordinator request declined',
        text: 'An administrator declined this coordinator request. If you think this is a mistake, please contact the CourseCompass administrator.',
      }
      : profile && profile.approval_status !== 'approved'
        ? {
          icon: '⏳',
          title: 'Waiting for admin approval',
          text: `Your coordinator account is being reviewed${profile.requested_college_name ? ` (college requested: ${profile.requested_college_name})` : ''}. You will be able to edit your college as soon as an administrator approves you.`,
        }
        : profile && !profile.college_id
          ? {
            icon: '🏫',
            title: 'No college assigned yet',
            text: 'Your account is approved, but an administrator has not linked it to a college yet. Please check back soon.',
          }
          : null;

  if (gate) {
    return (
      <div className="coordinator-dashboard co-page">
        {header}

        <main className="co-main">
          <div className="co-card co-gate">
            <div style={{ fontSize: 44 }}>{gate.icon}</div>
            <h2>{gate.title}</h2>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>{gate.text}</p>

            {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}

            <button type="button" className="co-btn co-btn-secondary" onClick={loadData}>
              Check again
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!college) {
    return (
      <div className="coordinator-dashboard co-page">
        {header}

        <main className="co-main">
          <div role="alert" className="co-card co-alert">
            {error || 'Your college could not be loaded.'}

            <div style={{ marginTop: 12 }}>
              <button type="button" className="co-btn co-btn-secondary" onClick={loadData}>
                Try again
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const collegeStatus = openCollegeChange?.status;

  const collegeInitial = (college.name || 'C').charAt(0).toUpperCase();

  return (
    <div className="coordinator-dashboard co-page">
      {header}

      <div
        className={`cc-drawer-backdrop${drawer.open ? ' is-open' : ''}`}
        onClick={drawer.close}
        aria-hidden="true"
      />

      <aside
        className={`cc-drawer co-drawer${drawer.open ? ' is-open' : ''}`}
        aria-label="Coordinator menu"
        aria-hidden={!drawer.open}
        inert={!drawer.open}
      >
        <div className="cc-drawer-head">
          {college.logo_url ? (
            <img className="cc-drawer-logo" src={college.logo_url} alt="" />
          ) : (
            <span className="cc-drawer-logo cc-drawer-logo-fallback">{collegeInitial}</span>
          )}

          <div>
            <strong>{college.name}</strong>
            <small>COORDINATOR WORKSPACE</small>
          </div>

          <button type="button" className="cc-drawer-close" onClick={drawer.close} aria-label="Close menu">
            ×
          </button>
        </div>

        <nav className="cc-drawer-nav">
          {menuItems.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'active' : ''}
              onClick={() => {
                setSection(id);
                setSearch('');
                clearMessages();
                drawer.close();
              }}
            >
              {label}
              {id === 'cutoffs' && programs.length > 0 && (
                <span className="cc-drawer-count">{programs.length}</span>
              )}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="cc-drawer-logout"
          onClick={onLogout}
        >
          ↪ Log out
        </button>
      </aside>

      <main className="co-main">
        <section
          className="co-hero"
          style={college.cover_url ? { '--co-cover': `url("${college.cover_url}")` } : undefined}
        >
          <CollegeLogo college={college} size={78} />

          <div className="co-hero-copy">
            <span className="co-eyebrow">COORDINATOR WORKSPACE</span>
            <h1>{college.name}</h1>
            <p>
              Update your college page, courses, cutoffs and fees.
              {' '}
              {college.is_published
                ? 'Your college is visible to students.'
                : 'Your college is not visible to students until an administrator publishes it.'}
            </p>
          </div>

          <span className={`co-live-pill ${college.is_published ? 'on' : 'off'}`}>
            {college.is_published ? '● Live' : '● Not published'}
          </span>
        </section>

        <div className="co-crumb">
          <span>CourseCompass</span> / {(menuItems.find(([id]) => id === section) || [])[1]?.replace(/^\S+\s/, '') || 'Overview'}
        </div>

        <div style={{ height: 14 }} />

        {error && (
          <div role="alert" className="co-msg co-msg-err">
            <strong>Error:</strong> {error}
          </div>
        )}

        {notice && (
          <div role="status" className="co-msg co-msg-ok">
            {notice}
          </div>
        )}

        {publishIssue && (
          <div role="alert" className="co-msg co-msg-warn">
            <strong>Not published yet.</strong> {publishIssue}
            <br />
            <small>
              Send this message to your administrator – the change is saved and nothing is lost.
            </small>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'overview' && (
          <>
            <div className={`wf-banner wf-banner-${collegeStatus || 'none'}`}>
              <div>
                <strong>
                  {college.is_published
                    ? 'Your college is live for students'
                    : 'Your college is not visible to students yet'}
                </strong>

                <p>
                  {!college.is_published &&
                    'An administrator needs to publish it first. '}
                  {collegeStatus === 'pending' &&
                    'Your latest changes are waiting for admin approval.'}
                  {collegeStatus === 'draft' &&
                    'You have an unsent draft. Open “My College” and submit it for review.'}
                  {collegeStatus === 'rejected' &&
                    `Your last submission was rejected${openCollegeChange.admin_note ? `: “${openCollegeChange.admin_note}”` : '.'} Fix it and submit again.`}
                  {!collegeStatus && college.is_published && 'No changes are waiting for review.'}
                </p>
              </div>

              <button type="button" className="co-btn co-btn-primary" onClick={() => setSection('college')}>
                {collegeStatus === 'rejected' ? 'Fix & resubmit' : 'Edit college'}
              </button>
            </div>

            <FormGrid className="cc-kpi-grid">
              {[
                ['Courses live', courses.filter((course) => course.is_published).length, '📚'],
                ['Waiting for approval', pendingCount, '⏳'],
                ['Needs your attention', rejectedCount, '⚠️'],
                ['Open student enquiries', pendingRequests, '👨‍🎓'],
              ].map(([label, value, icon]) => (
                <div key={label} className="co-card cc-kpi-card">
                  <div style={{ fontSize: 30 }} className="cc-kpi-icon">{icon}</div>
                  <p style={{ color: '#64748b', marginBottom: 6 }}>{label}</p>
                  <h2 style={{ margin: 0, fontSize: 32 }}>{value}</h2>
                </div>
              ))}
            </FormGrid>

            <div className="co-card">
              <h2>Quick Actions</h2>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" className="co-btn co-btn-primary" onClick={() => setSection('college')}>
                  Edit college details
                </button>

                <button type="button" className="co-btn co-btn-primary" onClick={startNewCourse}>
                  + Add Course
                </button>

                <button type="button" className="co-btn co-btn-secondary" onClick={() => setSection('requests')}>
                  Student Enquiries
                </button>

                <button type="button" className="co-btn co-btn-secondary" onClick={loadData}>
                  Refresh
                </button>
              </div>
            </div>

            <div className="co-card">
              <h2>Change history</h2>

              <div className="co-table-wrap">
                <table className="co-table" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      {['What', 'Status', 'Updated', 'Admin note', ''].map((label) => (
                        <th key={label} className="co-td">{label}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {changes.slice(0, 15).map((change) => (
                      <tr key={change.id}>
                        <td className="co-td">{change.summary || `${change.entity} ${change.action}`}</td>

                        <td className="co-td">
                          <StatusPill status={change.status}>
                            {STATUS_LABELS[change.status] || change.status}
                          </StatusPill>
                        </td>

                        <td className="co-td">{formatDate(change.updated_at)}</td>
                        <td className="co-td">{change.admin_note || '—'}</td>

                        <td className="co-td">
                          {change.status === 'pending' && (
                            <button
                              type="button"
                              className="co-btn co-btn-secondary"
                              disabled={busyId === change.id}
                              onClick={() => withdrawChange(change)}
                            >
                              Withdraw
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {!changes.length && (
                      <tr>
                        <td className="co-td" colSpan={5}>
                          Nothing yet. Edit your college or add a course to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'college' && (
          <div className="co-card">
            <h2>My College</h2>

            <p style={{ color: '#64748b' }}>
              Every field can be edited. <strong>Save draft</strong> keeps your work
              private; <strong>Submit for review</strong> sends it to the administrator.
              Students keep seeing the current published page until it is approved.
            </p>

            {openCollegeChange && (
              <div className={`wf-banner wf-banner-${openCollegeChange.status}`}>
                <div>
                  <strong>{STATUS_LABELS[openCollegeChange.status]}</strong>
                  <p>
                    {openCollegeChange.status === 'rejected' && openCollegeChange.admin_note
                      ? `Admin note: “${openCollegeChange.admin_note}”`
                      : openCollegeChange.summary}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {openCollegeChange.status === 'pending' && (
                    <button
                      type="button"
                      className="co-btn co-btn-secondary"
                      disabled={busyId === openCollegeChange.id}
                      onClick={() => withdrawChange(openCollegeChange)}
                    >
                      Withdraw
                    </button>
                  )}

                  {openCollegeChange.status !== 'pending' && (
                    <button
                      type="button"
                      className="co-btn co-btn-danger"
                      disabled={busyId === openCollegeChange.id}
                      onClick={() => discardChange(openCollegeChange)}
                    >
                      Discard changes
                    </button>
                  )}
                </div>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveCollege('pending');
              }}
            >
              <h3>Photos</h3>

              <PhotoPicker
                label="College logo"
                hint="Square images look best."
                urls={collegeForm.logo_url ? [collegeForm.logo_url] : []}
                busy={uploading === 'logo_url'}
                onFiles={(files) => handleSinglePhoto('logo_url', 'logo', files)}
                onRemove={() => setCollegeField('logo_url', '')}
              />

              <PhotoPicker
                label="Cover photo"
                hint="A wide campus photo. JPG, PNG or WebP."
                urls={collegeForm.cover_url ? [collegeForm.cover_url] : []}
                busy={uploading === 'cover_url'}
                onFiles={(files) => handleSinglePhoto('cover_url', 'cover', files)}
                onRemove={() => setCollegeField('cover_url', '')}
              />

              <PhotoPicker
                label={`Photo gallery (${collegeForm.gallery_urls.length}/${MAX_GALLERY})`}
                hint="Campus, labs, hostel, events…"
                multiple
                max={MAX_GALLERY}
                urls={collegeForm.gallery_urls}
                busy={uploading === 'gallery_urls'}
                onFiles={handleGalleryPhotos}
                onRemove={(index) =>
                  setCollegeField(
                    'gallery_urls',
                    collegeForm.gallery_urls.filter((_, i) => i !== index)
                  )
                }
              />

              <h3>Basic Information</h3>

              <FormGrid>
                <Field label="College name" value={collegeForm.name} onChange={(v) => setCollegeField('name', v)} required />
                <Field label="City" value={collegeForm.city} onChange={(v) => setCollegeField('city', v)} required />
                <Field label="State" value={collegeForm.state} onChange={(v) => setCollegeField('state', v)} />
                <Field label="Institution type" value={collegeForm.institution_type} onChange={(v) => setCollegeField('institution_type', v)} />
                <Field label="Established year" type="number" min="1800" max="2200" value={collegeForm.established_year} onChange={(v) => setCollegeField('established_year', v)} />
                <Field label="NIRF rank" type="number" min="1" value={collegeForm.nirf_rank} onChange={(v) => setCollegeField('nirf_rank', v)} />
                <Field label="Website URL" type="url" value={collegeForm.website} onChange={(v) => setCollegeField('website', v)} placeholder="https://example.edu" />
                <Field label="Latitude" type="number" min="-90" max="90" step="any" value={collegeForm.latitude} onChange={(v) => setCollegeField('latitude', v)} />
                <Field label="Longitude" type="number" min="-180" max="180" step="any" value={collegeForm.longitude} onChange={(v) => setCollegeField('longitude', v)} />
                <Field label="Campus area (acres)" type="number" min="0" step="any" value={collegeForm.campus_area_acres} onChange={(v) => setCollegeField('campus_area_acres', v)} />
              </FormGrid>

              <TextArea label="Full address" value={collegeForm.address} onChange={(v) => setCollegeField('address', v)} />
              <TextArea label="College description" value={collegeForm.description} onChange={(v) => setCollegeField('description', v)} rows={5} />

              <h3>Fees (INR)</h3>

              <FormGrid>
                <Field label="Annual fee (₹)" type="number" min="0" step="any" value={collegeForm.tuition_fee_annual} onChange={(v) => setCollegeField('tuition_fee_annual', v)} placeholder="e.g. 75000" />
                <Field label="Other annual fees (₹)" type="number" min="0" step="any" value={collegeForm.other_fee_annual} onChange={(v) => setCollegeField('other_fee_annual', v)} placeholder="e.g. 15000" />
              </FormGrid>

              <h3>Hostel Facilities</h3>

              <label style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={Boolean(collegeForm.hostel_available)}
                  onChange={(event) => setCollegeField('hostel_available', event.target.checked)}
                />
                Hostel available
              </label>

              <FormGrid>
                <Field label="Annual hostel fee (₹)" type="number" min="0" step="any" value={collegeForm.hostel_fee_annual} onChange={(v) => setCollegeField('hostel_fee_annual', v)} />
              </FormGrid>

              <TextArea label="Hostel details" value={collegeForm.hostel_details} onChange={(v) => setCollegeField('hostel_details', v)} />
              <TextArea label="Infrastructure (comma-separated)" value={collegeForm.infrastructure} onChange={(v) => setCollegeField('infrastructure', v)} placeholder="Library, laboratories, sports, transport, Wi-Fi" />

              <h3>Placement Details</h3>

              <FormGrid>
                <Field label="Average package (LPA)" type="number" min="0" step="any" value={collegeForm.avg_package_lpa} onChange={(v) => setCollegeField('avg_package_lpa', v)} />
                <Field label="Highest package (LPA)" type="number" min="0" step="any" value={collegeForm.highest_package_lpa} onChange={(v) => setCollegeField('highest_package_lpa', v)} />
                <Field label="Placement rate (%)" type="number" min="0" max="100" step="any" value={collegeForm.placement_rate} onChange={(v) => setCollegeField('placement_rate', v)} />
              </FormGrid>

              <TextArea label="Top recruiters (comma-separated)" value={collegeForm.top_recruiters} onChange={(v) => setCollegeField('top_recruiters', v)} placeholder="Company A, Company B, Company C" />

              <div className="wf-actions">
                <button className="co-btn co-btn-secondary" type="button" disabled={saving || Boolean(uploading)} onClick={() => saveCollege('draft')}>
                  Save draft
                </button>

                <button className="co-btn co-btn-primary" type="submit" disabled={saving || Boolean(uploading)}>
                  {saving ? 'Saving…' : 'Submit for review'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'courses' && (
          <>
            <div className="co-card">
              <h2>{editingCourse ? 'Edit Course' : 'Add Course'}</h2>

              <p style={{ color: '#64748b' }}>
                Courses you add or change are sent to the administrator. They
                appear for students only after approval.
              </p>

              <form onSubmit={saveCourse}>
                <FormGrid>
                  <Field label="Course name" value={courseForm.name} onChange={(value) => setCourseField('name', value)} required placeholder="e.g. Computer Science and Engineering" />

                  <SelectField
                    label="Stream"
                    value={courseForm.stream_id}
                    onChange={(value) => setCourseField('stream_id', value)}
                    required
                    options={STREAMS.map((stream) => ({ value: String(stream.id), label: stream.name }))}
                  />

                  <SelectField
                    label="Degree level"
                    value={courseForm.degree_level}
                    onChange={(value) => setCourseField('degree_level', value)}
                    required
                    options={DEGREE_LEVELS.map((level) => ({
                      value: level,
                      label: level.charAt(0).toUpperCase() + level.slice(1),
                    }))}
                  />

                  <Field
                    label="Duration (years)"
                    type="number"
                    min="0.01"
                    step="any"
                    value={courseForm.duration_years}
                    onChange={(value) =>
                      setCourseForm((previous) => ({
                        ...previous,
                        duration_years: value,
                        duration: value ? `${value} years` : '',
                      }))
                    }
                    required
                    placeholder="e.g. 3 or 4"
                  />

                  <Field label="Total seats" type="number" min="0" step="1" value={courseForm.total_seats} onChange={(value) => setCourseField('total_seats', value)} placeholder="e.g. 60" />
                  <Field label="Annual fee (₹)" type="number" min="0" step="any" value={courseForm.annual_fee} onChange={(value) => setCourseField('annual_fee', value)} placeholder="e.g. 75000" />
                  <Field label="Total course fee (₹)" type="number" min="0" step="any" value={courseForm.total_fee} onChange={(value) => setCourseField('total_fee', value)} placeholder="e.g. 300000" />
                </FormGrid>

                <TextArea
                  label="Course description"
                  value={courseForm.course_description}
                  onChange={(value) => setCourseField('course_description', value)}
                  placeholder="Describe the course and what students will learn."
                  rows={5}
                  required
                />

                <div className="wf-actions">
                  <button className="co-btn co-btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Submitting…' : editingCourse ? 'Submit changes for review' : 'Submit course for review'}
                  </button>

                  {editingCourse && (
                    <button
                      type="button"
                      className="co-btn co-btn-secondary"
                      disabled={saving}
                      onClick={() => {
                        setCourseForm({ ...emptyCourse });
                        setEditingCourse(null);
                        clearMessages();
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            <h2 className="co-section-title">Your courses</h2>

            <input
              className="co-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your courses..."
            />

            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    {['Course', 'Stream', 'Duration', 'Seats', 'Annual fee', 'Total fee', 'Status', 'Actions'].map((label) => (
                      <th key={label} className="co-td">{label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {courseRows.map((row) => {
                    const data = row.data;
                    const request = row.request;
                    const removal = request?.action === 'delete';

                    return (
                      <tr key={row.key}>
                        <td className="co-td">
                          <strong>{data.name || 'Untitled course'}</strong>
                          <br />
                          <small>{data.degree_level || 'Degree not specified'}</small>
                        </td>

                        <td className="co-td">
                          {STREAMS.find((stream) => stream.id === Number(data.stream_id))?.name || '—'}
                        </td>

                        <td className="co-td">
                          {data.duration || (data.duration_years ? `${data.duration_years} years` : '—')}
                        </td>

                        <td className="co-td">{data.total_seats ?? '—'}</td>
                        <td className="co-td">{money(data.annual_fee)}</td>
                        <td className="co-td">{money(data.total_fee)}</td>

                        <td className="co-td">
                          {row.kind === 'new' ? (
                            <StatusPill status={request.status}>
                              New – {STATUS_LABELS[request.status]}
                            </StatusPill>
                          ) : request ? (
                            <>
                              <StatusPill status={request.status}>
                                {removal ? 'Removal: ' : 'Edit: '}
                                {STATUS_LABELS[request.status]}
                              </StatusPill>

                              {request.status === 'rejected' && request.admin_note && (
                                <small style={{ display: 'block', marginTop: 4 }}>
                                  “{request.admin_note}”
                                </small>
                              )}
                            </>
                          ) : (
                            <StatusPill status={row.course.is_published ? 'approved' : 'draft'}>
                              {row.course.is_published ? 'Live' : 'Approved – shows once college is published'}
                            </StatusPill>
                          )}
                        </td>

                        <td className="co-td">
                          {row.kind === 'new' ? (
                            <>
                              <button type="button" className="co-btn co-btn-secondary" onClick={() => editNewCourseRequest(request)}>
                                Edit
                              </button>{' '}
                              {request.status === 'pending' ? (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => withdrawChange(request)}>
                                  Withdraw
                                </button>
                              ) : (
                                <button type="button" className="co-btn co-btn-danger" disabled={busyId === request.id} onClick={() => discardChange(request)}>
                                  Discard
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {!removal && (
                                <button type="button" className="co-btn co-btn-secondary" onClick={() => editLiveCourse(row.course)}>
                                  Edit
                                </button>
                              )}{' '}
                              {!removal && (
                                <button type="button" className="co-btn co-btn-secondary" onClick={() => openCourseCutoff(row.course)}>
                                  🎯 Cutoff
                                </button>
                              )}{' '}
                              {request && request.status !== 'pending' && (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => discardChange(request)}>
                                  Discard change
                                </button>
                              )}
                              {request?.status === 'pending' && (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => withdrawChange(request)}>
                                  Withdraw
                                </button>
                              )}
                              {!request && (
                                <button
                                  type="button"
                                  className="co-btn co-btn-danger"
                                  disabled={busyId === row.course.id}
                                  onClick={() => requestCourseRemoval(row.course)}
                                >
                                  Request removal
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!courseRows.length && (
                    <tr>
                      <td className="co-td" colSpan={8}>
                        No courses yet. Use the form above to add your first course.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'cutoffs' && (
          <>
            <div className="co-card">
              <h2 style={{ marginTop: 0 }}>
                {editingProgram?.programId && isEmptyCutoff(programs.find((p) => String(p.id) === String(editingProgram.programId)))
                  ? 'Add cutoff details'
                  : editingProgram ? 'Edit cutoff' : 'Add a cutoff'}
              </h2>

              <p style={{ color: '#64748b', marginTop: 0 }}>
                Cutoffs are entrance-exam <strong>ranks</strong> – a smaller number is harder to get.
                Students see your change only after an administrator approves it.
              </p>

              <form onSubmit={saveProgram}>
                <FormGrid>
                  <label className="co-label">
                    Course (linked)
                    <select
                      className="co-input"
                      value={programForm.course_id}
                      onChange={(e) => chooseProgramCourse(e.target.value)}
                      disabled={Boolean(editingProgram?.programId)}
                    >
                      <option value="">Not linked to a course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="co-label">
                    Branch *
                    <input
                      className="co-input"
                      value={programForm.branch}
                      onChange={(e) => setProgramField('branch', e.target.value)}
                      placeholder="Computer Science"
                      required
                      readOnly={Boolean(programForm.course_id)}
                    />
                  </label>

                  <label className="co-label">
                    Entrance exam *
                    <input className="co-input" list="cc-exams" value={programForm.exam} onChange={(e) => setProgramField('exam', e.target.value)} required />
                    <datalist id="cc-exams">
                      {EXAM_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
                    </datalist>
                  </label>

                  <label className="co-label">
                    Category *
                    <input className="co-input" list="cc-categories" value={programForm.category} onChange={(e) => setProgramField('category', e.target.value)} required />
                    <datalist id="cc-categories">
                      {CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
                    </datalist>
                  </label>

                  <Field label="Cutoff rank / marks" type="number" min="1" step="1" required value={programForm.cutoff_rank} onChange={(v) => setProgramField('cutoff_rank', v)} placeholder="e.g. 4500" />
                  <Field label="Cutoff year" type="number" min="2000" max="2100" value={programForm.cutoff_year} onChange={(v) => setProgramField('cutoff_year', v)} />
                  <Field label="Round" value={programForm.cutoff_round} onChange={(v) => setProgramField('cutoff_round', v)} placeholder="Round 1 / Final" />
                  <Field label="Annual fee (₹)" type="number" min="0" step="any" value={programForm.annual_fee} onChange={(v) => setProgramField('annual_fee', v)} />
                  <Field label="Source link" type="url" value={programForm.cutoff_source_url} onChange={(v) => setProgramField('cutoff_source_url', v)} placeholder="https://…" />
                </FormGrid>

                <div className="wf-actions">
                  <button type="submit" className="co-btn co-btn-primary" disabled={saving}>
                    {saving ? 'Submitting…' : editingProgram ? 'Submit update for review' : 'Submit cutoff for review'}
                  </button>

                  {editingProgram && (
                    <button type="button" className="co-btn co-btn-secondary" onClick={startNewProgram}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            <input
              className="co-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search branch, exam or category…"
            />

            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    {['Course / Branch', 'Exam', 'Category', 'Cutoff rank', 'Year', 'Round', 'Status', 'Actions'].map((label) => (
                      <th key={label} className="co-td">{label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {programRows.map((row) => {
                    const { data, request } = row;
                    const removal = request?.action === 'delete';

                    return (
                      <tr key={row.key}>
                        <td className="co-td">{data.branch || '—'}</td>
                        <td className="co-td">{data.exam || '—'}</td>
                        <td className="co-td">{data.category || '—'}</td>
                        <td className="co-td"><strong>{data.cutoff_rank != null ? Number(data.cutoff_rank).toLocaleString('en-IN') : '—'}</strong></td>
                        <td className="co-td">{data.cutoff_year ?? '—'}</td>
                        <td className="co-td">{data.cutoff_round || '—'}</td>

                        <td className="co-td">
                          {row.kind === 'new' ? (
                            <StatusPill status={request.status}>New – {STATUS_LABELS[request.status]}</StatusPill>
                          ) : request ? (
                            <>
                              <StatusPill status={request.status}>
                                {removal ? 'Removal: ' : 'Edit: '}{STATUS_LABELS[request.status]}
                              </StatusPill>
                              {request.status === 'rejected' && request.admin_note && (
                                <small style={{ display: 'block', marginTop: 4 }}>“{request.admin_note}”</small>
                              )}
                            </>
                          ) : isEmptyCutoff(row.program) ? (
                            <StatusPill status="draft">Awaiting cutoff</StatusPill>
                          ) : (
                            <StatusPill status="approved">Live</StatusPill>
                          )}
                        </td>

                        <td className="co-td">
                          {row.kind === 'new' ? (
                            <>
                              <button type="button" className="co-btn co-btn-secondary" onClick={() => editNewProgramRequest(request)}>Edit</button>{' '}
                              {request.status === 'pending' ? (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => withdrawChange(request)}>Withdraw</button>
                              ) : (
                                <button type="button" className="co-btn co-btn-danger" disabled={busyId === request.id} onClick={() => discardChange(request)}>Discard</button>
                              )}
                            </>
                          ) : (
                            <>
                              {!removal && (
                                <button type="button" className="co-btn co-btn-secondary" onClick={() => editLiveProgram(row.program)}>
                                  {isEmptyCutoff(row.program) && !request ? 'Add cutoff details' : 'Edit'}
                                </button>
                              )}{' '}
                              {request && request.status !== 'pending' && (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => discardChange(request)}>Discard change</button>
                              )}
                              {request?.status === 'pending' && (
                                <button type="button" className="co-btn co-btn-secondary" disabled={busyId === request.id} onClick={() => withdrawChange(request)}>Withdraw</button>
                              )}
                              {!request && !row.program.course_id && (
                                <button type="button" className="co-btn co-btn-danger" disabled={busyId === `program-${row.program.id}`} onClick={() => requestProgramRemoval(row.program)}>Request removal</button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!programRows.length && (
                    <tr>
                      <td className="co-td" colSpan={8}>
                        No cutoffs yet. Use the form above to add your first cutoff.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'requests' && (
          <>
            <h2>Student Enquiries</h2>

            <p style={{ color: '#64748b' }}>
              Enquiries sent to {college.name}. Update their follow-up status here.
            </p>

            <input
              className="co-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, email or message..."
            />

            <div className="co-table-wrap">
              <table className="co-table">
                <thead>
                  <tr>
                    {['Student', 'Contact', 'Message', 'Reply', 'Status'].map((label) => (
                      <th key={label} className="co-td">{label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="co-td">{request.student_name || 'Unknown'}</td>

                      <td className="co-td">
                        {request.student_email || 'No email'}
                        <br />
                        {request.phone || 'No phone'}
                      </td>

                      <td className="co-td">{request.message || 'No message'}</td>
                      <td className="co-td" style={{ minWidth: 240 }}>
                        <textarea
                          className="co-input"
                          rows={3}
                          placeholder="Write a reply to the student..."
                          value={replyDrafts[request.id] ?? request.reply ?? ''}
                          onChange={(event) =>
                            setReplyDrafts((prev) => ({ ...prev, [request.id]: event.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="co-btn co-btn-primary"
                          disabled={busyId === request.id}
                          onClick={() => handleSendReply(request)}
                        >
                          {request.reply ? 'Update reply' : 'Send reply'}
                        </button>
                        {request.replied_at && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Replied {new Date(request.replied_at).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td className="co-td">
                        <select
                          className="co-input"
                          value={request.status || 'pending'}
                          disabled={busyId === request.id}
                          onChange={(event) => handleUpdateRequestStatus(request, event.target.value)}
                        >
                          <option value="pending">Pending</option>
                          <option value="contacted">Contacted</option>
                          <option value="resolved">Resolved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                    </tr>
                  ))}

                  {!filteredRequests.length && (
                    <tr>
                      <td className="co-td" colSpan={5}>No student enquiries are available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ------------------------------------------------------------ */}
        {section === 'profile' && (
          <div className="co-card co-narrow">
            <h2>Coordinator Profile</h2>

            <p><strong>Name:</strong> {profile?.full_name || 'Not provided'}</p>
            <p><strong>Email:</strong> {profile?.email || user.email || 'Not available'}</p>
            <p><strong>College:</strong> {college.name}</p>
            <p><strong>Role:</strong> {profile?.role || 'coordinator'}</p>
            <p><strong>Approval:</strong> {profile?.approval_status || 'Unknown'}</p>

            <button type="button" className="co-btn co-btn-secondary" onClick={loadData}>
              Refresh Data
            </button>
          </div>
        )}

        <footer
          style={{
            textAlign: 'center',
            color: '#64748b',
            padding: '30px 0 10px',
            fontSize: 13,
          }}
        >
          CourseCompass · Coordinator Portal
        </footer>
      </main>
    </div>
  );
}
