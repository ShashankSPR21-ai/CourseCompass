import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './CollegeEnquiry.css'

// "Ask this college" form shown in the College Finder details popup.
// Saves into public.student_requests; the college's coordinator sees it
// under Student Requests in their portal.
export default function CollegeEnquiry({ college }) {
  const [profile, setProfile] = useState({ id: null, name: '', email: '' })
  const [mine, setMine] = useState([])
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadMe() {
      const { data } = await supabase.auth.getUser()
      const u = data?.user
      if (!u || !active) return
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', u.id)
        .maybeSingle()
      if (!active) return
      setProfile({
        id: u.id,
        name: p?.full_name || u.user_metadata?.full_name || '',
        email: p?.email || u.email || '',
      })
      if (p?.phone) setPhone(p.phone)
    }
    loadMe()
    return () => {
      active = false
    }
  }, [])

  async function loadMine(userId) {
    if (!userId || !college?.id) return
    const { data } = await supabase
      .from('student_requests')
      .select('id, message, reply, replied_at, status, created_at')
      .eq('student_id', userId)
      .eq('college_id', college.id)
      .order('created_at', { ascending: false })
    setMine(data || [])
  }

  useEffect(() => {
    loadMine(profile.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, college?.id, sent])

  // Reset when a different college is opened.
  useEffect(() => {
    setSent(false)
    setError('')
    setMessage('')
  }, [college?.id])

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!message.trim()) {
      setError('Please type your question.')
      return
    }

    setSending(true)
    const { error: insertError } = await supabase
      .from('student_requests')
      .insert({
        student_id: profile.id,
        student_name: profile.name || profile.email || 'Student',
        student_email: profile.email || null,
        phone: phone.trim() || null,
        college_id: college.id,
        message: message.trim(),
        status: 'pending',
      })
    setSending(false)

    if (insertError) {
      setError(`Could not send your query: ${insertError.message}`)
      return
    }
    setSent(true)
    setMessage('')
  }

  const history = mine.length > 0 && (
    <div className="cce-box">
      <h3>Your queries to this college</h3>
      {mine.map((q) => (
        <div key={q.id} className="cce-item">
          <div><strong>You:</strong> {q.message}</div>
          {q.reply ? (
            <div className="cce-reply"><strong>College reply:</strong> {q.reply}</div>
          ) : (
            <div className="cce-hint">Waiting for a reply…</div>
          )}
        </div>
      ))}
    </div>
  )

  if (sent) {
    return (<>
      <div className="cce-box cce-ok">
        ✓ Your query was sent to {college.name}. The college coordinator will
        contact you.
        <button type="button" onClick={() => setSent(false)}>
          Ask another question
        </button>
      </div>
      {history}
    </>)
  }

  return (<>
    <form className="cce-box" onSubmit={submit}>
      <h3>Ask this college</h3>
      <p className="cce-hint">
        Your question goes straight to the college coordinator.
      </p>

      <input
        type="tel"
        placeholder="Phone number (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <textarea
        rows={4}
        placeholder="Type your question about admission, fees, hostel, placements..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />

      {error && <div className="cce-error">{error}</div>}

      <button type="submit" disabled={sending}>
        {sending ? 'Sending...' : 'Send query'}
      </button>
    </form>
    {history}
  </>)
}
