import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCardInfoFor, type CardInfo } from '../lib/scryfall'

type Deck = { id: string; name: string }
type Row = {
  card_name: string
  count: number
  is_commander: boolean
  set_code?: string | null
  collector_number?: string | null
}

function bucket(typeLine: string): string {
  if (typeLine.includes('Land')) return 'Lands'
  if (typeLine.includes('Creature')) return 'Creatures'
  if (typeLine.includes('Instant')) return 'Instants'
  if (typeLine.includes('Sorcery')) return 'Sorceries'
  if (typeLine.includes('Artifact')) return 'Artifacts'
  if (typeLine.includes('Enchantment')) return 'Enchantments'
  if (typeLine.includes('Planeswalker')) return 'Planeswalkers'
  if (typeLine.includes('Battle')) return 'Battles'
  return 'Other'
}

// unique key per row INCLUDING printing (so each printing can have its own image/type_line)
const keyFor = (r: Row) =>
  `${r.card_name}|${r.set_code ?? ''}|${r.collector_number ?? ''}`

export default function DeckViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [infos, setInfos] = useState<Record<string, CardInfo | null>>({})
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [err, setErr] = useState<string | null>(null)

  // load deck + cards (include printing columns)
  useEffect(() => {
    (async () => {
      if (!id) return
      setErr(null)

      const d = await supabase
        .from('decks')
        .select('id,name')
        .eq('id', id)
        .single()
      if (d.error || !d.data) {
        setErr(d.error?.message ?? 'Deck not found')
        return
      }
      setDeck(d.data as Deck)

      const c = await supabase
        .from('deck_cards')
        .select('card_name,count,is_commander,set_code,collector_number')
        .eq('deck_id', id)
      if (c.error || !c.data) {
        setErr(c.error?.message ?? 'No cards')
        return
      }
      setRows(c.data as Row[])
    })()
  }, [id])

  // fetch printing-aware scryfall info for each row
  useEffect(() => {
    (async () => {
      const keys = Array.from(new Set(rows.map(keyFor)))
      const pairs = await Promise.all(
        keys.map(async (k) => {
          const [name, set, num] = k.split('|')
          const info = await getCardInfoFor(
            name,
            set || undefined,
            num || undefined
          )
          return [k, info] as const
        })
      )
      setInfos(Object.fromEntries(pairs))
    })()
  }, [rows])

  const commander = rows.find((r) => r.is_commander) || null
  const commanderInfo = commander ? infos[keyFor(commander)] : null

  const mainCount = rows
    .filter((r) => !r.is_commander)
    .reduce((s, r) => s + r.count, 0)
  const ok99 = mainCount === 99
  const hasCommander = !!commander

  // group by type using the info for THAT printing
  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {}
    const counts: Record<string, number> = {}
    for (const r of rows.filter((r) => !r.is_commander)) {
      const t = infos[keyFor(r)]?.type_line ?? ''
      const b = bucket(t)
      if (!g[b]) {
        g[b] = []
        counts[b] = 0
      }
      g[b].push(r)
      counts[b] += r.count
    }
    Object.values(g).forEach((arr) =>
      arr.sort((a, b) => a.card_name.localeCompare(b.card_name))
    )
    const order = [
      'Creatures',
      'Instants',
      'Sorceries',
      'Artifacts',
      'Enchantments',
      'Planeswalkers',
      'Battles',
      'Lands',
      'Other',
    ]
    return { g, counts, order }
  }, [rows, infos])

  const setCmd = async (name: string) => {
    if (!id) return
    const { error: e1 } = await supabase
      .from('deck_cards')
      .update({ is_commander: false })
      .eq('deck_id', id)
    if (e1) return alert(e1.message)
    const { error: e2 } = await supabase
      .from('deck_cards')
      .update({ is_commander: true })
      .eq('deck_id', id)
      .eq('card_name', name)
    if (e2) return alert(e2.message)
    const c = await supabase
      .from('deck_cards')
      .select('card_name,count,is_commander,set_code,collector_number')
      .eq('deck_id', id)
    if (!c.error && c.data) setRows(c.data as Row[])
  }

  const clearCmd = async () => {
    if (!id) return
    const { error } = await supabase
      .from('deck_cards')
      .update({ is_commander: false })
      .eq('deck_id', id)
    if (error) return alert(error.message)
    const c = await supabase
      .from('deck_cards')
      .select('card_name,count,is_commander,set_code,collector_number')
      .eq('deck_id', id)
    if (!c.error && c.data) setRows(c.data as Row[])
  }

  const goEdit = async () => {
    if (!deck) return
    const d = await supabase
      .from('decks')
      .select('id,name,list_text')
      .eq('id', deck.id)
      .single()
    if (d.error || !d.data) return alert(d.error?.message ?? 'Deck not found')
    localStorage.setItem('edit-deck', JSON.stringify(d.data))
    navigate('/') // Deck Builder
  }

  return (
    <div className="container">
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{deck?.name ?? 'Deck'}</h2>
          <button className="btn ghost" onClick={() => navigate('/decks')}>
            Back to My Decks
          </button>
          <div className="spacer" />
          <button
            className="btn ghost"
            onClick={() => setView('list')}
            disabled={view === 'list'}
          >
            List
          </button>
          <button
            className="btn"
            onClick={() => setView('grid')}
            disabled={view === 'grid'}
          >
            Grid
          </button>
          <button className="btn" onClick={goEdit}>
            Edit deck
          </button>
        </div>

        <div className="row" style={{ borderBottom: 'none', padding: 0, gap: 16 }}>
          <div>
            Summary: Main {mainCount}
            {ok99 ? ' ✅' : ` ⚠️ need ${99 - mainCount}`}
          </div>
          <div>Commander: {hasCommander ? 'Yes ✅' : 'No ⚠️'}</div>
        </div>

        {err && <div className="error">{err}</div>}

        {/* Commander pinned */}
        {commander && (
          <div className="card" style={{ background: '#161616' }}>
            <h3 style={{ marginTop: 0 }}>Commander</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <img
                src={commanderInfo?.normal}
                alt={commander.card_name}
                style={{
                  width: 300,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}
              />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {commander.card_name}
                </div>
                <button className="btn ghost" onClick={clearCmd}>
                  Clear commander
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Groups */}
        {grouped.order.map((group) => {
          const rowsInGroup = grouped.g[group]
          if (!rowsInGroup?.length) return null
          const qty = grouped.counts[group] ?? rowsInGroup.length
          return (
            <div key={group} className="card">
              <h3 style={{ marginTop: 0 }}>
                {group} <span className="muted">(Qty: {qty})</span>
              </h3>

              {view === 'list' ? (
                <ul>
                  {rowsInGroup.map((r) => (
                    <li
                      key={keyFor(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>
                        {r.count} × {r.card_name}
                      </span>
                      <div className="spacer" />
                      {!hasCommander && (
                        <button className="btn mini" onClick={() => setCmd(r.card_name)}>
                          Set as Commander
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid nice-grid">
                  {rowsInGroup.map((r) => {
                    const info = infos[keyFor(r)]
                    return (
                      <div key={keyFor(r)} className="thumb-wrap">
                        {r.count > 1 && <div className="count-badge">×{r.count}</div>}
                        <a
                          className="thumb"
                          href={info?.normal}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {info ? (
                            <img src={info.normal} alt={r.card_name} />
                          ) : (
                            <div className="thumb-fallback">{r.card_name}</div>
                          )}
                        </a>
                        {!hasCommander && (
                          <button
                            className="btn mini overlay"
                            onClick={() => setCmd(r.card_name)}
                          >
                            Set as Commander
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}