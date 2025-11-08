import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CardThumb from './CardThumb'

type Deck = { id: string; name: string; created_at: string }
type CardRow = { card_name: string; count: number; is_commander: boolean }

export default function MyDecks() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)
  const [cards, setCards] = useState<CardRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const navigate = useNavigate()

  const setCommander = async (deckId: string, name: string) => {
  // 1) clear any existing commander
  let { error: e1 } = await supabase
    .from('deck_cards')
    .update({ is_commander: false })
    .eq('deck_id', deckId)
  if (e1) return alert(e1.message)

  // 2) set this card as commander
  let { error: e2 } = await supabase
    .from('deck_cards')
    .update({ is_commander: true })
    .eq('deck_id', deckId)
    .eq('card_name', name)
  if (e2) return alert(e2.message)

  // refresh the visible list
  showDeck(deckId)
}

const clearCommander = async (deckId: string) => {
  const { error } = await supabase
    .from('deck_cards')
    .update({ is_commander: false })
    .eq('deck_id', deckId)
  if (error) return alert(error.message)
  showDeck(deckId)
}

  const loadDecks = async () => {
    setErr(null); setLoading(true)
    const { data, error } = await supabase
      .from('decks').select('id,name,created_at')
      .order('created_at', { ascending: false })
    if (error) setErr(error.message)
    setDecks(data ?? [])
    setLoading(false)
  }
  useEffect(() => { loadDecks() }, [])

  const showDeck = async (id: string) => {
    setSelId(id); setErr(null); setCards(null)
    const { data, error } = await supabase
      .from('deck_cards')
      .select('card_name,count,is_commander')
      .eq('deck_id', id)
      .order('card_name', { ascending: true })
    if (error) setErr(error.message)
    setCards(data ?? [])
  }

  const delDeck = async (id: string) => {
    if (!confirm('Delete this deck?')) return
    const { error } = await supabase.from('decks').delete().eq('id', id)
    if (error) return alert(error.message)
    if (selId === id) { setSelId(null); setCards(null) }
    loadDecks()
  }

  const editDeck = async (id: string) => {
    const { data, error } = await supabase
      .from('decks').select('id,name,list_text').eq('id', id).single()
    if (error || !data) return alert(error?.message ?? 'Deck not found')
    // stash for builder page to pick up
    localStorage.setItem('edit-deck', JSON.stringify(data))
    navigate('/') // go to builder
  }

  return (
    <div className="stack">
      {loading && <div>Loading…</div>}
      {err && <div className="error">{err}</div>}

      {decks.map(d => (
        <div key={d.id} className="row">
          <button className="btn" onClick={() => showDeck(d.id)}>{d.name}</button>
          <small className="muted">{new Date(d.created_at).toLocaleString()}</small>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => editDeck(d.id)}>Edit</button>
          <button className="btn danger" onClick={() => delDeck(d.id)}>Delete</button>
        </div>
      ))}

      {selId && cards && (
  <div className="card">
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <h3 style={{margin:0}}>Cards</h3>
      <button className="btn ghost" onClick={() => clearCommander(selId!)}>Clear commander</button>
    </div>

    <div className="grid" style={{marginTop:12}}>
      {cards.map((c, i) => (
        <div key={i}>
          <CardThumb name={c.card_name} />
          <div style={{marginTop:6, fontSize:12}}>
            {c.count} × {c.card_name}{' '}
            {c.is_commander ? '⭐ (Commander)' : ''}
          </div>
          {!c.is_commander && (
            <button
              className="btn mini"
              onClick={() => setCommander(selId!, c.card_name)}
              style={{marginTop:6}}
            >
              Set commander
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)}

    </div>
  )
}
