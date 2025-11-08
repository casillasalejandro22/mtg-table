import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type DeckCardRow = { card_name: string; count: number }

function parseList(text: string): DeckCardRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const rows: DeckCardRow[] = []
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(.+)$/)
    if (!m) throw new Error(`Bad line format: "${line}" (use "1 Card Name")`)
    rows.push({ count: parseInt(m[1], 10), card_name: m[2] })
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

  // Listen for "load-deck" from MyDecks → fill the form and switch to edit mode
  useEffect(() => {
    const handler = (e: any) => {
      const { id, name, list_text } = e.detail
      setDeckId(id); setName(name); setListText(list_text)
      setRows(null)
    }
    window.addEventListener('load-deck', handler as any)
    return () => window.removeEventListener('load-deck', handler as any)
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

        const toInsert = parsed.map(r => ({ deck_id: id, card_name: r.card_name, count: r.count }))
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
        const toInsert = parsed.map(r => ({ deck_id: deckId, card_name: r.card_name, count: r.count }))
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
