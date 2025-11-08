import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Deck = { id: string; name: string; created_at: string }
type CardRow = { card_name: string; count: number; is_commander: boolean }

export default function MyDecks() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)
  const [cards, setCards] = useState<CardRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
    // Tell the importer to load this deck into the form for editing
    window.dispatchEvent(new CustomEvent('load-deck', { detail: data }))
    // Also show its current cards
    showDeck(id)
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <h3>My Decks</h3>
      {loading && <div>Loading…</div>}
      {err && <div style={{color:'salmon'}}>{err}</div>}
      {decks.map(d => (
        <div key={d.id} style={{display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={() => showDeck(d.id)}>{d.name}</button>
          <small>{new Date(d.created_at).toLocaleString()}</small>
          <button onClick={() => editDeck(d.id)}>Edit</button>
          <button onClick={() => delDeck(d.id)}>Delete</button>
        </div>
      ))}
      {selId && cards && (
        <div>
          <h4>Cards in selected deck</h4>
          <ul>
            {cards.map((c,i)=>(
              <li key={i}>
                {c.count} × {c.card_name}{c.is_commander ? ' (Commander)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
