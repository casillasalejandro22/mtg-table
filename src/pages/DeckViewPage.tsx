import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCardInfo, type CardInfo } from '../lib/scryfall'

type Deck = { id: string; name: string }
type Row  = { card_name: string; count: number; is_commander: boolean }

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

export default function DeckViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [infos, setInfos] = useState<Record<string, CardInfo | null>>({})
  const [view, setView] = useState<'grid'|'list'>('grid')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      if (!id) return
      setErr(null)
      const d = await supabase.from('decks').select('id,name').eq('id', id).single()
      if (d.error || !d.data) { setErr(d.error?.message ?? 'Deck not found'); return }
      setDeck(d.data as Deck)

      const c = await supabase.from('deck_cards').select('card_name,count,is_commander').eq('deck_id', id)
      if (c.error || !c.data) { setErr(c.error?.message ?? 'No cards'); return }
      setRows(c.data as Row[])
    })()
  }, [id])

  useEffect(() => {
    (async () => {
      const names = Array.from(new Set(rows.map(r => r.card_name)))
      const entries = await Promise.all(names.map(async n => [n, await getCardInfo(n)] as const))
      setInfos(Object.fromEntries(entries))
    })()
  }, [rows])

  const commander = rows.find(r => r.is_commander) || null
  const mainCount = rows.filter(r => !r.is_commander).reduce((s,r)=>s+r.count,0)
  const ok99 = mainCount === 99
  const hasCommander = !!commander

  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {}
    const counts: Record<string, number> = {}
    for (const r of rows.filter(r=>!r.is_commander)) {
      const t = infos[r.card_name]?.type_line ?? ''
      const b = bucket(t)
      if (!g[b]) { g[b] = []; counts[b] = 0 }
      g[b].push(r)
      counts[b] += r.count                 // total copies per group
    }
    Object.values(g).forEach(arr => arr.sort((a,b)=>a.card_name.localeCompare(b.card_name)))
    const order = ['Creatures','Instants','Sorceries','Artifacts','Enchantments','Planeswalkers','Battles','Lands','Other']
    return { g, counts, order }
  }, [rows, infos])

  const setCmd = async (name: string) => {
    if (!id) return
    let { error: e1 } = await supabase.from('deck_cards').update({ is_commander: false }).eq('deck_id', id)
    if (e1) return alert(e1.message)
    let { error: e2 } = await supabase.from('deck_cards').update({ is_commander: true }).eq('deck_id', id).eq('card_name', name)
    if (e2) return alert(e2.message)
    const c = await supabase.from('deck_cards').select('card_name,count,is_commander').eq('deck_id', id)
    if (!c.error && c.data) setRows(c.data as Row[])
  }

  const clearCmd = async () => {
    if (!id) return
    const { error } = await supabase.from('deck_cards').update({ is_commander: false }).eq('deck_id', id)
    if (error) return alert(error.message)
    const c = await supabase.from('deck_cards').select('card_name,count,is_commander').eq('deck_id', id)
    if (!c.error && c.data) setRows(c.data as Row[])
  }

  const goEdit = async () => {
    if (!deck) return
    const d = await supabase.from('decks').select('id,name,list_text').eq('id', deck.id).single()
    if (d.error || !d.data) return alert(d.error?.message ?? 'Deck not found')
    localStorage.setItem('edit-deck', JSON.stringify(d.data))
    navigate('/') // Deck Builder
  }

  return (
    <div className="container">
      <div className="card" style={{display:'grid', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <h2 style={{margin:0}}>{deck?.name ?? 'Deck'}</h2>
          <button className="btn ghost" onClick={() => navigate('/decks')}>Back to My Decks</button>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => setView('list')} disabled={view==='list'}>List</button>
          <button className="btn" onClick={() => setView('grid')} disabled={view==='grid'}>Grid</button>
          <button className="btn" onClick={goEdit}>Edit deck</button>
        </div>

        <div className="row" style={{borderBottom:'none', padding:0, gap:16}}>
          <div>Summary: Main {mainCount}{ok99 ? ' ✅' : ` ⚠️ need ${99-mainCount}`}</div>
          <div>Commander: {hasCommander ? 'Yes ✅' : 'No ⚠️'}</div>
        </div>

        {err && <div className="error">{err}</div>}

        {/* Commander pinned */}
        {commander && (
          <div className="card" style={{background:'#161616'}}>
            <h3 style={{marginTop:0}}>Commander</h3>
            <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
              <img
                src={infos[commander.card_name]?.normal}
                alt={commander.card_name}
                style={{width:300, borderRadius:12, border:'1px solid var(--border)'}}
              />
              <div>
                <div style={{fontSize:18, fontWeight:700}}>{commander.card_name}</div>
                <button className="btn ghost" onClick={clearCmd}>Clear commander</button>
              </div>
            </div>
          </div>
        )}

        {/* Groups */}
        {grouped.order.map(group => {
          const rowsInGroup = grouped.g[group]
          if (!rowsInGroup?.length) return null
          const qty = grouped.counts[group] ?? rowsInGroup.length
          return (
            <div key={group} className="card">
              <h3 style={{marginTop:0}}>{group} <span className="muted">(Qty: {qty})</span></h3>

              {view === 'list' ? (
                <ul>
                  {rowsInGroup.map(r => (
                    <li key={r.card_name} style={{display:'flex', alignItems:'center', gap:8}}>
                      <span>{r.count} × {r.card_name}</span>
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
                  {rowsInGroup.map(r => (
                    <div key={r.card_name} className="thumb-wrap">
                      <div className="count-badge">×{r.count}</div>
                      <a className="thumb" href={infos[r.card_name]?.normal} target="_blank" rel="noreferrer">
                        <img src={infos[r.card_name]?.normal} alt={r.card_name} />
                      </a>
                      {!hasCommander && (
                        <button className="btn mini overlay" onClick={() => setCmd(r.card_name)}>
                          Set as Commander
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}