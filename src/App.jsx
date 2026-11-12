
import { useEffect, useState } from 'react'
import Auth from './Auth'
import ResetPassword from './ResetPassword'
import AuthenticatedApp from './AuthenticatedApp'
import { supabase } from './lib/supabaseClient'
import './App.css'

const CURRENT_YEAR = new Date().getFullYear()

const courses = [
  {
    name: 'Computer Science Engineering',
    short: 'CSE',
    category: 'Engineering',
    description:
      'Explore programming, software development, algorithms, and databases.',
    careers: 'Software Engineer, Full Stack Developer, Systems Analyst',
  },
  {
    name: 'Artificial Intelligence & Machine Learning',
    short: 'AI',
    category: 'Technology',
    description:
      'Explore artificial intelligence, machine learning, and intelligent systems.',
    careers: 'AI Engineer, ML Engineer, Data Scientist',
  },
  {
    name: 'Data Science',
    short: 'DS',
    category: 'Technology',
    description:
      'Learn about data analysis, statistics, visualization, and predictive models.',
    careers: 'Data Analyst, Data Scientist, Business Analyst',
  },
  {
    name: 'Cyber Security',
    short: 'CS',
    category: 'Technology',
    description:
      'Explore network security, ethical hacking, and digital protection.',
    careers: 'Security Analyst, Penetration Tester, Security Engineer',
  },
  {
    name: 'Internet of Things',
    short: 'IoT',
    category: 'Technology',
    description:
      'Connect smart devices using sensors, microcontrollers, and networks.',
    careers: 'IoT Developer, Embedded Engineer, IoT Solutions Engineer',
  },
  {
    name: 'Electronics & Communication',
    short: 'ECE',
    category: 'Engineering',
    description:
      'Learn about electronics, communication systems, and embedded technologies.',
    careers: 'Electronics Engineer, Hardware Engineer, Network Engineer',
  },
]

function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('Session loading failed:', error.message)
        } else {
          setSession(data.session)
        }
      } catch (error) {
        console.error('Unable to check login session:', error)
      } finally {
        if (mounted) {
          setCheckingSession(false)
        }
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (mounted) {
        if (event === 'PASSWORD_RECOVERY') setRecovering(true)
        setSession(newSession)
        setCheckingSession(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // The user opened the reset link from their email: ask for a new password.
  if (recovering && session?.user) {
    return <ResetPassword onDone={() => setRecovering(false)} />
  }

  // Route authenticated users through database role verification.
  if (session?.user) {
    return (
      <AuthenticatedApp
        user={session.user}
        onLogout={() => {
          setSession(null)
        }}
      />
    )
  }

  if (checkingSession) {
    return (
      <div className="app-loading">
        <p>Loading CourseCompass...</p>
      </div>
    )
  }

  const filteredCourses = courses.filter((course) =>
    `${course.name} ${course.category} ${course.careers}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">C</span>
          <span>
            Course<span className="brand-highlight">Compass</span>
          </span>
        </a>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#courses">Explore Courses</a>
          <a href="#guidance">Career Guidance</a>
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className="login-link"
            onClick={() => setAuthMode('login')}
          >
            Log in
          </button>

          <button
            type="button"
            className="signup-button"
            onClick={() => setAuthMode('signup')}
          >
            Get Started
          </button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero" id="home">
          <div className="hero-content">
            <span className="eyebrow">
              YOUR FUTURE STARTS WITH THE RIGHT CHOICE
            </span>

            <h1>
              Find the right course.
              <br />
              <span>Build your future.</span>
            </h1>

            <p className="hero-description">
              Explore courses, discover career opportunities, and make
              informed decisions about your education with CourseCompass.
            </p>

            <div className="hero-actions">
              <a className="signup-button hero-button" href="#courses">
                Explore Courses →
              </a>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setAuthMode('signup')}
              >
                Create Free Account
              </button>
            </div>

            <div className="hero-trust">
              <span>✓ Explore career options</span>
              <span>✓ Compare courses</span>
              <span>✓ Plan your future</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-card visual-card-main">
              <div className="visual-top">
                <span className="visual-label">YOUR CAREER JOURNEY</span>
                <span className="visual-dot">●</span>
              </div>

              <div className="visual-illustration">
                <div className="illustration-circle">
                  <div className="illustration-cap">🎓</div>
                </div>
              </div>

              <h3>Discover your potential</h3>
              <p>Every great career begins with a choice.</p>

              <div className="visual-progress">
                <span />
              </div>

              <div className="visual-progress-label">
                <span>Your journey</span>
                <strong>Just getting started</strong>
              </div>
            </div>

            <div className="floating-card floating-card-top">
              <span className="floating-icon">✦</span>
              <div>
                <strong>Explore</strong>
                <small>New possibilities</small>
              </div>
            </div>

            <div className="floating-card floating-card-bottom">
              <span className="floating-icon">↗</span>
              <div>
                <strong>Grow your future</strong>
                <small>One step at a time</small>
              </div>
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="stats-section">
          <div className="stat-item">
            <strong>Explore</strong>
            <span>Different courses</span>
          </div>

          <div className="stat-item">
            <strong>Discover</strong>
            <span>Career opportunities</span>
          </div>

          <div className="stat-item">
            <strong>Compare</strong>
            <span>Education pathways</span>
          </div>

          <div className="stat-item">
            <strong>Plan</strong>
            <span>Your next step</span>
          </div>
        </section>

        {/* Courses Section */}
        <section className="courses-section" id="courses">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FIND YOUR DIRECTION</span>
              <h2>Explore popular courses</h2>
              <p>
                Discover fields of study and explore where they could take you.
              </p>
            </div>
          </div>

          <div className="search-container">
            <span className="search-icon">⌕</span>

            <input
              type="search"
              placeholder="Search courses, technologies, or careers..."
              aria-label="Search courses"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="course-grid">
            {filteredCourses.map((course, index) => (
              <article className="course-card" key={course.name}>
                <div className="course-card-top">
                  <span className={`course-icon course-icon-${index % 6}`}>
                    {course.short}
                  </span>

                  <span className="course-category">{course.category}</span>
                </div>

                <h3>{course.name}</h3>
                <p>{course.description}</p>

                <div className="course-card-bottom">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedCourse(course)}
                  >
                    Explore course →
                  </button>
                </div>
              </article>
            ))}
          </div>

          {filteredCourses.length === 0 && (
            <div className="empty-state">
              <h3>No courses found</h3>
              <p>Try another search term.</p>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setSearch('')}
              >
                Clear search
              </button>
            </div>
          )}
        </section>

        {/* Career Guidance Section */}
        <section className="guidance-section" id="guidance">
          <div className="guidance-content">
            <span className="eyebrow">YOUR NEXT CHAPTER</span>

            <h2>
              Your interests.
              <br />
              Your skills. Your future.
            </h2>

            <p>
              Explore different fields, understand possible career paths,
              and make choices that match your interests and goals.
            </p>

            <button
              type="button"
              className="signup-button guidance-button"
              onClick={() => setAuthMode('signup')}
            >
              Start Your Journey →
            </button>
          </div>

          <div className="guidance-steps">
            <div className="guidance-step">
              <span className="step-number">01</span>
              <div>
                <h3>Discover</h3>
                <p>Explore subjects and fields that interest you.</p>
              </div>
            </div>

            <div className="guidance-step">
              <span className="step-number">02</span>
              <div>
                <h3>Understand</h3>
                <p>Learn about courses, skills, and career opportunities.</p>
              </div>
            </div>

            <div className="guidance-step">
              <span className="step-number">03</span>
              <div>
                <h3>Plan</h3>
                <p>Take your next step with greater confidence.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="cta-section">
          <span className="eyebrow">TAKE THE FIRST STEP</span>
          <h2>Ready to explore your possibilities?</h2>
          <p>Create your account and start your CourseCompass journey.</p>

          <button
            type="button"
            className="signup-button cta-button"
            onClick={() => setAuthMode('signup')}
          >
            Get Started for Free →
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-icon">C</span>
          <span>
            Course<span className="brand-highlight">Compass</span>
          </span>
        </a>

        <p>Helping students explore education and career possibilities.</p>

        <span className="footer-copyright">
          © {CURRENT_YEAR} CourseCompass. All rights reserved.
        </span>
      </footer>

      {/* Course Details Modal */}
      {selectedCourse && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedCourse(null)}
        >
          <section
            className="course-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close course details"
              onClick={() => setSelectedCourse(null)}
            >
              ×
            </button>

            <span className="eyebrow">COURSE OVERVIEW</span>

            <span className="course-icon modal-icon">
              {selectedCourse.short}
            </span>

            <h2 id="course-modal-title">{selectedCourse.name}</h2>
            <span className="course-category">
              {selectedCourse.category}
            </span>

            <p>{selectedCourse.description}</p>

            <h3>Possible career paths</h3>
            <p>{selectedCourse.careers}</p>

            <small>
              Course availability, eligibility, and career outcomes vary by
              institution and individual qualifications.
            </small>

            <button
              type="button"
              className="signup-button modal-action"
              onClick={() => {
                setSelectedCourse(null)
                setAuthMode('signup')
              }}
            >
              Create an account
            </button>
          </section>
        </div>
      )}

      {/* Authentication Modal */}
      {authMode !== null && (
        <Auth
          key={authMode}
          mode={authMode}
          onClose={() => setAuthMode(null)}
        />
      )}
    </div>
  )
}

export default App
