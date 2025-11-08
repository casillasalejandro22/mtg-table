import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type DeckCardRow = {
  card_name: string
  count: number
  set_code?: string
  collector_number?: string
}

function parseList(text: string): DeckCardRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const rows: DeckCardRow[] = []
  for (const line of lines) {
    // Supports:
    // 1 Sol Ring
    // 1x Sol Ring
    // 1 Sol Ring (ltr) 224
    // 1x Sol Ring (LTR) 224a
    const m = line.match(/^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9\-]{2,5})\)\s+([\w\-]+))?$/i)
    if (!m) throw new Error(`Bad line: "${line}" (use "1 Card" or "1x Card (set) 123")`)
    const [, c, name, set, num] = m
    rows.push({
      count: parseInt(c, 10),
      card_name: name,
      set_code: set?.toLowerCase(),
      collector_number: num
    })
  }
  return rows
}

export default function DeckImport() {
  const [name, setName] = useState('')
  const [listText, setListText] = useState('')
  const [deckId, setDeckId] = useState<string | null>(null) // if set => edit mode
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<DeckCardRow[] | null>(null)

    useEffect(() => {
    const raw = localStorage.getItem('edit-deck')
    if (raw) {
      try {
        const d = JSON.parse(raw)
        setDeckId(d.id); setName(d.name); setListText(d.list_text); setRows(null)
      } catch {}
      localStorage.removeItem('edit-deck')
    }
  }, [])

  const doSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    window.location.href = '/mtg-table/'
  }

  const saveOrUpdate = async () => {
    setError(null)
    try {
      const parsed = parseList(listText)
      setSaving(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (!deckId) {
        // CREATE
        const { data: deck, error: deckErr } = await supabase
          .from('decks')
          .insert([{ user_id: user.id, name, list_text: listText }])
          .select('id').single()
        if (deckErr) throw deckErr
        const id = deck.id as string

        const toInsert = parsed.map(r => ({
            deck_id: id,
            card_name: r.card_name,
            count: r.count,
            set_code: r.set_code ?? null,
            collector_number: r.collector_number ?? null
            }))
        const { error: cardsErr } = await supabase.from('deck_cards')
          .upsert(toInsert, { onConflict: 'deck_id,card_name' })
        if (cardsErr) throw cardsErr

        setDeckId(id)
        setRows(parsed)
      } else {
        // UPDATE existing deck
        const { error: upErr } = await supabase
          .from('decks').update({ name, list_text: listText }).eq('id', deckId)
        if (upErr) throw upErr

        // Replace its cards: delete then insert fresh
        const { error: delErr } = await supabase.from('deck_cards').delete().eq('deck_id', deckId)
        if (delErr) throw delErr
        const toInsert = parsed.map(r => ({
            deck_id: deckId,
            card_name: r.card_name,
            count: r.count,
            set_code: r.set_code ?? null,
            collector_number: r.collector_number ?? null
            }))
        const { error: insErr } = await supabase.from('deck_cards').insert(toInsert)
        if (insErr) throw insErr

        setRows(parsed)
      }
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const clearForm = () => {
    setDeckId(null); setName(''); setListText(''); setRows(null); setError(null)
  }

  return (
    <div style={{ padding:16, display:'grid', gap:12, maxWidth:700 }}>
      <h3>{deckId ? 'Edit Deck' : 'New Deck'}</h3>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input placeholder="Deck name" value={name} onChange={e=>setName(e.target.value)} />
        <button disabled={!name || !listText || saving} onClick={saveOrUpdate}>
          {saving ? 'Saving…' : deckId ? 'Update deck' : 'Save deck'}
        </button>
        <button onClick={clearForm}>Clear</button>
        <button onClick={doSignOut}>Sign out</button>
      </div>

      <textarea
        placeholder={'Paste list (e.g.\n1 Sol Ring\n1 Swamp\n...)'}
        value={listText}
        onChange={e=>setListText(e.target.value)}
        rows={12}
        style={{ fontFamily:'monospace' }}
      />

      {error && <div style={{ color:'salmon' }}>{error}</div>}

      {rows && (
        <div>
          <h4>Parsed {rows.length} rows {deckId ? `(deck ${deckId.slice(0,8)}…)` : ''}</h4>
          <ul>
            {rows.map((r, i) => (
              <li key={i}>{r.count} × {r.card_name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
