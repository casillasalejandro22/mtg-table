import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Deck = { id: string; name: string; created_at: string }

export default function MyDecks() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadDecks = async () => {
    setErr(null); setLoading(true)
    const { data, error } = await supabase
      .from('decks')
      .select('id,name,created_at')
      .order('created_at', { ascending: false })
    if (error) setErr(error.message)
    setDecks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadDecks() }, [])

  const delDeck = async (id: string) => {
    if (!confirm('Delete this deck?')) return
    const { error } = await supabase.from('decks').delete().eq('id', id)
    if (error) return alert(error.message)
    loadDecks()
  }

  const editDeck = async (id: string) => {
    const { data, error } = await supabase
      .from('decks')
      .select('id,name,list_text')
      .eq('id', id)
      .single()
    if (error || !data) return alert(error?.message ?? 'Deck not found')
    localStorage.setItem('edit-deck', JSON.stringify(data))
    navigate('/') // go to Deck Builder
  }

  return (
    <div className="stack">
      {loading && <div>Loading…</div>}
      {err && <div className="error">{err}</div>}

      {decks.map(d => (
        <div key={d.id} className="row">
          <button className="btn" onClick={() => navigate(`/deck/${d.id}`)}>
            {d.name}
          </button>
          <small className="muted">{new Date(d.created_at).toLocaleString()}</small>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => editDeck(d.id)}>Edit</button>
          <button className="btn danger" onClick={() => delDeck(d.id)}>Delete</button>
        </div>
      ))}

      {!loading && decks.length === 0 && (
        <div className="muted">No decks yet — create one in Deck Builder.</div>
      )}
    </div>
  )
}
