
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import CollegeFinder from './CollegeFinder';
import SmartCollegePredictor from './SmartCollegePredictor';
import CutoffComparison from './CutoffComparison';
import CollegeComparison from './CollegeComparison';
import SavedColleges from './SavedColleges';
import MenuButton from './MenuButton';
import { useDrawer } from './lib/useDrawer';
import './Dashboard.css';

const CURRENT_YEAR = new Date().getFullYear();

const initialSaved = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem('coursecompass_saved_courses') || '[]'
    );

    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
};

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not specified';
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'Not specified';
  }

  return `₹${amount.toLocaleString('en-IN')}`;
}

function getDuration(course) {
  if (
    course.duration !== null &&
    course.duration !== undefined &&
    String(course.duration).trim() !== ''
  ) {
    return String(course.duration);
  }

  if (
    course.duration_years !== null &&
    course.duration_years !== undefined &&
    course.duration_years !== ''
  ) {
    const years = Number(course.duration_years);

    return `${course.duration_years} ${years === 1 ? 'year' : 'years'
      }`;
  }

  return '';
}

function mapCourse(course, index) {
  return {
    id: course.id ?? `database-course-${index}`,
    name: course.name || course.course_name || course.title || 'Course',
    category:
      course.category ||
      course.domain ||
      course.degree_level ||
      'Other',
    icon: '🎓',
    description:
      course.course_description ||
      course.description ||
      'Explore this course and learn about its opportunities.',
    duration: getDuration(course),
    annual_fee: course.annual_fee ?? null,
    total_fee: course.total_fee ?? null,
    careers:
      course.careers ||
      'Career opportunities depend on your skills and experience.',
    collegeName:
      course.colleges?.name ||
      course.college_name ||
      null,
    collegeId: course.college_id ?? null,
  };
}

export default function Dashboard({ user, onLogout, onNavigate }) {
  const [activePage, setActivePage] = useState('overview');
  const drawer = useDrawer();
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [savedIds, setSavedIds] = useState(initialSaved);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  // Load the student's profile and published standalone courses.
  useEffect(() => {
    let cancelled = false;

    async function runLoad() {
      setLoadingCourses(true);
      setLoadError('');

      try {
        if (user?.id) {
          const {
            data: profileData,
            error: profileError,
          } = await supabase
            .from('profiles')
            .select('full_name, email, role')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error(
              'Unable to load profile:',
              profileError.message
            );
          }

          if (!cancelled) {
            setProfile(profileData || null);
          }
        } else if (!cancelled) {
          setProfile(null);
        }

        const { data, error } = await supabase
          .from('courses')
          .select('*, colleges(id, name, city, is_published)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.error(
            'Unable to load published courses:',
            error.message
          );

          if (!cancelled) {
            setCourses([]);
            setLoadError(`Unable to load courses: ${error.message}`);
          }

          return;
        }

        if (!cancelled) {
          // Standalone courses + courses coordinators added for their college
          // (hide a college's courses while the college itself is unpublished).
          const mappedCourses = (data || [])
            .filter((course) => !course.college_id || course.colleges?.is_published)
            .map(mapCourse);

          setCourses(mappedCourses);

          console.table(
            mappedCourses.map((course) => ({
              id: course.id,
              name: course.name,
              annual_fee: course.annual_fee,
              total_fee: course.total_fee,
            }))
          );
        }
      } catch (error) {
        console.error('Dashboard loading failed:', error);

        if (!cancelled) {
          setCourses([]);
          setLoadError(
            error?.message || 'Unable to load courses.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCourses(false);
        }
      }
    }

    runLoad();

    // Re-fetch when the student comes back to this tab, so courses a coordinator
    // just published show up without a manual page reload.
    const onVisible = () => {
      if (document.visibilityState === 'visible') runLoad();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id]);

  // Save the student's course shortlist locally.
  useEffect(() => {
    try {
      localStorage.setItem(
        'coursecompass_saved_courses',
        JSON.stringify(savedIds)
      );
    } catch (error) {
      console.error('Unable to save courses locally:', error);
    }
  }, [savedIds]);

  // Automatically dismiss notification messages.
  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setMessage('');
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [message]);

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Student';

  const categories = [
    'All',
    ...new Set(
      courses
        .map((course) => course.category)
        .filter(Boolean)
    ),
  ];

  const filteredCourses = courses.filter((course) => {
    const searchText = search.trim().toLowerCase();

    const matchesSearch = [
      course.name,
      course.category,
      course.description,
      course.careers,
      course.duration,
      course.collegeName,
      course.annual_fee,
      course.total_fee,
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchText);

    const matchesCategory =
      category === 'All' || course.category === category;

    const matchesSaved =
      activePage !== 'saved' ||
      savedIds.includes(String(course.id));

    return matchesSearch && matchesCategory && matchesSaved;
  });

  const savedCourseCount = courses.filter((course) =>
    savedIds.includes(String(course.id))
  ).length;

  function toggleSaved(course) {
    const id = String(course.id);
    const alreadySaved = savedIds.includes(id);

    setSavedIds((previous) =>
      alreadySaved
        ? previous.filter((savedId) => savedId !== id)
        : [...previous, id]
    );

    setMessage(
      alreadySaved
        ? 'Course removed from saved courses.'
        : 'Course saved successfully.'
    );
  }

  function navigate(page) {
    drawer.close();
    setActivePage(page);
    setSelectedCourse(null);
    setSearch('');
    setCategory('All');

    if (onNavigate) {
      onNavigate(page);
    }
  }

  // Sign out safely and prevent repeated clicks.
  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('Logout failed:', error.message);
        setMessage(`Unable to log out: ${error.message}`);
        setLoggingOut(false);
        return;
      }

      if (onLogout) {
        onLogout();
      }
    } catch (error) {
      console.error('Logout failed:', error);
      setMessage('Unable to log out. Please try again.');
      setLoggingOut(false);
    }
  }

  const pageTitles = {
    overview: 'Dashboard Overview',
    courses: 'Explore Courses',
    colleges: 'College Finder',
    predictor: 'Smart College Predictor',
    comparison: 'College Comparison',
    cutoffs: 'Cutoff Comparison',
    saved: 'Your Saved Courses',
    wishlist: 'Saved Colleges',
    profile: 'My Profile',
  };

  return (
    <div className="cc-dashboard">
      <div
        className={`cc-drawer-backdrop${drawer.open ? ' is-open' : ''}`}
        onClick={drawer.close}
        aria-hidden="true"
      />

      <aside
        className={`cc-sidebar cc-drawer${drawer.open ? ' is-open' : ''}`}
        aria-label="Main menu"
        aria-hidden={!drawer.open}
        inert={!drawer.open}
      >
        <button
          type="button"
          className="cc-drawer-close cc-drawer-close-float"
          onClick={drawer.close}
          aria-label="Close menu"
        >
          ×
        </button>

        <button
          type="button"
          className="cc-brand"
          onClick={() => navigate('overview')}
          aria-label="CourseCompass home"
        >
          <span className="cc-brand-icon">C</span>
          <span>
            Course<span>Compass</span>
          </span>
        </button>

        <div className="cc-sidebar-label">STUDENT WORKSPACE</div>

        <nav className="cc-side-nav">
          <button
            type="button"
            className={activePage === 'overview' ? 'active' : ''}
            onClick={() => navigate('overview')}
          >
            <span>▦</span> Overview
          </button>

          <button
            type="button"
            className={activePage === 'courses' ? 'active' : ''}
            onClick={() => navigate('courses')}
          >
            <span>▤</span> Explore Courses
          </button>

          <button
            type="button"
            className={activePage === 'colleges' ? 'active' : ''}
            onClick={() => navigate('colleges')}
          >
            <span>⌂</span> College Finder
          </button>

          <button
            type="button"
            className={activePage === 'predictor' ? 'active' : ''}
            onClick={() => navigate('predictor')}
          >
            <span>🎓</span> Smart College Predictor
          </button>

          <button
            type="button"
            className={activePage === 'comparison' ? 'active' : ''}
            onClick={() => navigate('comparison')}
          >
            <span>⚖️</span> College Comparison
          </button>

          <button
            type="button"
            className={activePage === 'cutoffs' ? 'active' : ''}
            onClick={() => navigate('cutoffs')}
          >
            <span>⇄</span> Cutoff Comparison
          </button>

          <button
            type="button"
            className={activePage === 'saved' ? 'active' : ''}
            onClick={() => navigate('saved')}
          >
            <span>♡</span> Saved Courses
            <span className="cc-nav-count">{savedCourseCount}</span>
          </button>

          <button
            type="button"
            className={activePage === 'wishlist' ? 'active' : ''}
            onClick={() => navigate('wishlist')}
          >
            <span>⭐</span> Saved Colleges
          </button>

          <button
            type="button"
            className={activePage === 'profile' ? 'active' : ''}
            onClick={() => navigate('profile')}
          >
            <span>◎</span> My Profile
          </button>
        </nav>

        <div className="cc-sidebar-bottom">
          <div className="cc-help-card">
            <div className="cc-help-icon">✦</div>
            <h4>Your future starts here</h4>
            <p>
              Explore courses and discover your possibilities.
            </p>

            <button
              type="button"
              onClick={() => navigate('courses')}
            >
              Explore now →
            </button>
          </div>

          <button
            type="button"
            className="cc-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <span>↪</span>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </aside>

      <main className="cc-main">
        <header className="cc-topbar">
          <MenuButton open={drawer.open} onClick={drawer.toggle} />

          <div className="cc-breadcrumb">
            <span>CourseCompass</span>
            <span className="cc-breadcrumb-divider">/</span>
            {pageTitles[activePage] || 'Dashboard'}
          </div>

          <div className="cc-topbar-actions">
            <button
              type="button"
              className="cc-topbar-logout"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Log out of your student account"
            >
              <span aria-hidden="true">↪</span>
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>

            <button
              type="button"
              className="cc-user-chip"
              onClick={() => navigate('profile')}
              aria-label={`Open profile for ${displayName}`}
            >
              <span className="cc-avatar">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="cc-user-chip-name">
                {displayName}
              </span>
              <span className="cc-chevron">⌄</span>
            </button>
          </div>
        </header>

        <div className="cc-content">
          {message && (
            <div className="cc-toast" role="status">
              {message}
            </div>
          )}

          {loadError && (
            <div className="cc-toast" role="alert">
              {loadError}
            </div>
          )}

          <div className="cc-dashboard-actions">
            <button
              type="button"
              className="cc-secondary-btn"
              onClick={() => window.location.reload()}
              disabled={loadingCourses}
            >
              {loadingCourses
                ? 'Refreshing…'
                : '↻ Refresh dashboard'}
            </button>
          </div>

          {activePage === 'overview' && (
            <>
              <section className="cc-welcome">
                <div className="cc-welcome-copy">
                  <span className="cc-eyebrow">
                    YOUR LEARNING JOURNEY
                  </span>

                  <h1>
                    Welcome back, {displayName.split(' ')[0]}!
                    <span className="cc-wave"> 👋</span>
                  </h1>

                  <p>
                    Your future is full of possibilities. Explore your
                    interests and take the next step toward your dream
                    career.
                  </p>

                  <button
                    type="button"
                    className="cc-primary-btn"
                    onClick={() => navigate('courses')}
                  >
                    Explore courses <span>→</span>
                  </button>

                  <button
                    type="button"
                    className="cc-secondary-btn"
                    onClick={() => navigate('predictor')}
                  >
                    Find colleges for my rank 🎓
                  </button>
                </div>

                <div className="cc-welcome-art" aria-hidden="true">
                  <div className="cc-art-orbit cc-orbit-one" />
                  <div className="cc-art-orbit cc-orbit-two" />
                  <div className="cc-art-book">📚</div>
                  <div className="cc-art-star cc-star-one">✦</div>
                  <div className="cc-art-star cc-star-two">✧</div>
                  <div className="cc-art-pill">Discover your path</div>
                </div>
              </section>

              <section className="cc-stats-grid">
                <article className="cc-stat-card">
                  <div className="cc-stat-top">
                    <span className="cc-stat-icon purple">▤</span>
                    <span className="cc-stat-label">
                      Available courses
                    </span>
                  </div>
                  <strong>{courses.length}</strong>
                  <p>Courses to explore</p>
                </article>

                <article className="cc-stat-card">
                  <div className="cc-stat-top">
                    <span className="cc-stat-icon pink">♡</span>
                    <span className="cc-stat-label">Saved courses</span>
                  </div>
                  <strong>{savedIds.length}</strong>
                  <p>Your personal shortlist</p>
                </article>

                <article className="cc-stat-card">
                  <div className="cc-stat-top">
                    <span className="cc-stat-icon blue">◎</span>
                    <span className="cc-stat-label">
                      Career assessment
                    </span>
                  </div>
                  <strong>Ready</strong>
                  <p>Discover your interests</p>
                </article>

                <article className="cc-stat-card">
                  <div className="cc-stat-top">
                    <span className="cc-stat-icon green">↗</span>
                    <span className="cc-stat-label">Your next step</span>
                  </div>
                  <strong>Explore</strong>
                  <p>Find your future direction</p>
                </article>
              </section>

              <section className="cc-section">
                <div className="cc-section-heading">
                  <div>
                    <span className="cc-eyebrow">START EXPLORING</span>
                    <h2>Popular courses</h2>
                    <p>
                      Discover fields that could shape your future.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="cc-text-btn"
                    onClick={() => navigate('courses')}
                  >
                    View all courses →
                  </button>
                </div>

                {loadingCourses && (
                  <p className="cc-info-message">
                    Loading courses…
                  </p>
                )}

                <div className="cc-course-grid">
                  {courses.slice(0, 3).map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      saved={savedIds.includes(String(course.id))}
                      onOpen={() => setSelectedCourse(course)}
                      onSave={() => toggleSaved(course)}
                    />
                  ))}
                </div>

                {!loadingCourses && courses.length === 0 && (
                  <p className="cc-info-message">
                    No published courses are available yet.
                  </p>
                )}
              </section>

              <section className="cc-next-step">
                <div className="cc-next-step-icon">✦</div>
                <div>
                  <h3>
                    Looking for a college that matches your rank?
                  </h3>
                  <p>
                    Enter your entrance exam, rank, category, preferred
                    branch, location, and budget to explore matching
                    college programs.
                  </p>
                </div>
                <button
                  type="button"
                  className="cc-secondary-btn"
                  onClick={() => navigate('predictor')}
                >
                  Open college predictor →
                </button>
              </section>

              <section className="cc-next-step">
                <div className="cc-next-step-icon">⚖️</div>
                <div>
                  <h3>Shortlist your favourite colleges</h3>
                  <p>
                    Compare up to three colleges side by side, including
                    available fees, branches, placements, and campus
                    details.
                  </p>
                </div>
                <button
                  type="button"
                  className="cc-secondary-btn"
                  onClick={() => navigate('comparison')}
                >
                  Compare colleges →
                </button>
              </section>

              <section className="cc-next-step">
                <div className="cc-next-step-icon">⭐</div>
                <div>
                  <h3>Keep your favourite colleges together</h3>
                  <p>
                    Save colleges you're interested in and return to your
                    shortlist whenever you need.
                  </p>
                </div>
                <button
                  type="button"
                  className="cc-secondary-btn"
                  onClick={() => navigate('wishlist')}
                >
                  View saved colleges →
                </button>
              </section>
            </>
          )}

          {activePage === 'courses' && (
            <section className="cc-section cc-page-section">
              <div className="cc-section-heading">
                <div>
                  <span className="cc-eyebrow">
                    FIND YOUR DIRECTION
                  </span>
                  <h1>Explore courses</h1>
                  <p>
                    Search different fields and discover career options.
                  </p>
                </div>
              </div>

              <div className="cc-course-tools">
                <label className="cc-search-box">
                  <span>⌕</span>
                  <input
                    type="search"
                    placeholder="Search courses, skills, or careers..."
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                </label>

                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value)
                  }
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item === 'All' ? 'All categories' : item}
                    </option>
                  ))}
                </select>
              </div>

              {loadingCourses && (
                <p className="cc-info-message">
                  Loading courses…
                </p>
              )}

              <div className="cc-course-grid">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    saved={savedIds.includes(String(course.id))}
                    onOpen={() => setSelectedCourse(course)}
                    onSave={() => toggleSaved(course)}
                  />
                ))}
              </div>

              {!loadingCourses && filteredCourses.length === 0 && (
                <div className="cc-empty-state">
                  <span>🔎</span>
                  <h3>No courses found</h3>
                  <p>
                    No matching published courses were found.
                    Try a different search or check again later.
                  </p>
                  <button
                    type="button"
                    className="cc-secondary-btn"
                    onClick={() => {
                      setSearch('');
                      setCategory('All');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
          )}

          {activePage === 'colleges' && <CollegeFinder />}
          {activePage === 'predictor' && <SmartCollegePredictor />}
          {activePage === 'comparison' && <CollegeComparison />}
          {activePage === 'cutoffs' && <CutoffComparison />}

          {activePage === 'saved' && (
            <section className="cc-section cc-page-section">
              <div className="cc-section-heading">
                <div>
                  <span className="cc-eyebrow">YOUR SHORTLIST</span>
                  <h1>Saved courses</h1>
                  <p>
                    Keep track of courses you want to explore further.
                  </p>
                </div>
              </div>

              <div className="cc-course-grid">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    saved
                    onOpen={() => setSelectedCourse(course)}
                    onSave={() => toggleSaved(course)}
                  />
                ))}
              </div>

              {filteredCourses.length === 0 && (
                <div className="cc-empty-state">
                  <span>♡</span>
                  <h3>Your shortlist is empty</h3>
                  <p>
                    Save published courses you like and find
                    them here later.
                  </p>
                  <button
                    type="button"
                    className="cc-primary-btn"
                    onClick={() => navigate('courses')}
                  >
                    Explore courses →
                  </button>
                </div>
              )}
            </section>
          )}

          {activePage === 'wishlist' && <SavedColleges />}

          {activePage === 'profile' && (
            <section className="cc-section cc-page-section">
              <span className="cc-eyebrow">YOUR ACCOUNT</span>
              <h1>My profile</h1>
              <p className="cc-profile-intro">
                Review your current account information.
              </p>

              <div className="cc-profile-card">
                <div className="cc-profile-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                <h2>{displayName}</h2>
                <p>
                  {user?.email ||
                    profile?.email ||
                    'No email available'}
                </p>

                <div className="cc-profile-divider" />

                <div className="cc-profile-row">
                  <span>Full name</span>
                  <strong>
                    {profile?.full_name || displayName}
                  </strong>
                </div>

                <div className="cc-profile-row">
                  <span>Email address</span>
                  <strong>
                    {user?.email || profile?.email || '—'}
                  </strong>
                </div>

                <div className="cc-profile-row">
                  <span>Account role</span>
                  <strong>{profile?.role || 'student'}</strong>
                </div>

                <div className="cc-profile-row">
                  <span>Saved courses</span>
                  <strong>{savedIds.length}</strong>
                </div>

                <p className="cc-profile-note">
                  Profile editing and education details will be added
                  in a later development step.
                </p>
              </div>
            </section>
          )}

          <footer className="cc-dashboard-footer">
            <span>© {CURRENT_YEAR} CourseCompass</span>
            <span>Explore possibilities. Build your future.</span>
          </footer>
        </div>
      </main>

      {selectedCourse && (
        <div
          className="cc-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCourse(null);
            }
          }}
        >
          <div
            className="cc-course-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cc-course-title"
          >
            <button
              type="button"
              className="cc-modal-close"
              onClick={() => setSelectedCourse(null)}
              aria-label="Close course details"
            >
              ×
            </button>

            <div className="cc-modal-icon">
              {selectedCourse.icon}
            </div>

            <span className="cc-eyebrow">
              {selectedCourse.category}
            </span>

            <h2 id="cc-course-title">{selectedCourse.name}</h2>

            {selectedCourse.duration && (
              <div className="cc-modal-careers">
                <h3>Duration</h3>
                <p>{selectedCourse.duration}</p>
              </div>
            )}

            {selectedCourse.collegeName && (
              <div className="cc-modal-careers">
                <h3>College</h3>
                <p>{selectedCourse.collegeName}</p>
              </div>
            )}

            <p>{selectedCourse.description}</p>

            <div className="cc-modal-careers">
              <h3>Annual fee</h3>
              <p>{formatMoney(selectedCourse.annual_fee)}</p>
            </div>

            <div className="cc-modal-careers">
              <h3>Total fee</h3>
              <p>{formatMoney(selectedCourse.total_fee)}</p>
            </div>

            {selectedCourse.collegeName && (
              <div className="cc-modal-careers">
                <h3>College</h3>
                <p>{selectedCourse.collegeName}</p>
              </div>
            )}

            <div className="cc-modal-careers">
              <h3>Possible career paths</h3>
              <p>{selectedCourse.careers}</p>
            </div>

            <button
              type="button"
              className="cc-primary-btn cc-modal-save"
              onClick={() => toggleSaved(selectedCourse)}
            >
              {savedIds.includes(String(selectedCourse.id))
                ? '♥ Remove from saved'
                : '♡ Save this course'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, saved, onOpen, onSave }) {
  return (
    <article className="cc-course-card">
      <div className="cc-course-card-top">
        <span className="cc-course-icon">{course.icon}</span>

        <button
          type="button"
          className={`cc-save-btn ${saved ? 'is-saved' : ''}`}
          onClick={onSave}
          aria-label={saved ? 'Remove saved course' : 'Save course'}
          title={saved ? 'Remove saved course' : 'Save course'}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>

      <span className="cc-course-category">{course.category}</span>

      <h3>{course.name}</h3>

      {course.duration && (
        <p className="cc-course-duration">
          <strong>Duration:</strong> {course.duration}
        </p>
      )}

      <p>{course.description}</p>

      <div className="cc-course-fees">
        <p className="cc-course-fee">
          <strong>Annual fee:</strong>{' '}
          {formatMoney(course.annual_fee)}
        </p>

        <p className="cc-course-fee">
          <strong>Total fee:</strong>{' '}
          {formatMoney(course.total_fee)}
        </p>
      </div>

      {course.collegeName && (
        <p className="cc-course-college">
          College: {course.collegeName}
        </p>
      )}

      <button
        type="button"
        className="cc-course-link"
        onClick={onOpen}
      >
        View details <span>→</span>
      </button>
    </article>
  );
}
