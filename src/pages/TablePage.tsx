import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}

type Room = { id: string; pin: string }
type MP = {
  match_id: string
  user_id: string
  seat: number | null
  life: number | null
  deck_id: string | null
  hand_count: number | null
  library_count: number | null
  graveyard_count: number | null
  exile_count: number | null
}
type RP = { user_id: string; nickname: string | null; seat: number | null }

export default function TablePage() {
  const { pin } = useParams()
  const nav = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)

  const [players, setPlayers] = useState<MP[]>([])
  const [names, setNames] = useState<Record<string, RP>>({})

  const [myHand, setMyHand] = useState<{id:string; card_name:string; set_code:string|null; collector_number:string|null}[]>([])


  const seats = useMemo(() => {
    // seat numbers 1..4 (clockwise)
    const bySeat: Record<number, MP | null> = { 1:null, 2:null, 3:null, 4:null }
    for (const p of players) {
      if (p.seat && bySeat[p.seat] == null) bySeat[p.seat] = p
    }
    const withNames = (s: number) => {
      const p = bySeat[s]
      if (!p) {
        return {
          seat: s, name: 'Empty',
          life: null as number | null, deck: false,
          hand: null as number | null, library: null as number | null,
          graveyard: null as number | null, exile: null as number | null,
        }
      }
      const nick = names[p.user_id]?.nickname ?? p.user_id.slice(0,8)
      return {
        seat: s, name: nick,
        life: p.life,
        deck: !!p.deck_id,
        hand: p.hand_count ?? 0,
        library: p.library_count ?? 0,
        graveyard: p.graveyard_count ?? 0,
        exile:     p.exile_count     ?? 0,
      }
    }
    return [withNames(1), withNames(2), withNames(3), withNames(4)]
  }, [players, names])

  const isOwner = !!me && !!ownerId && me === ownerId

  const myPlayer = useMemo(() => players.find(p => p.user_id === me) ?? null, [players, me])
  const mySeat   = myPlayer?.seat ?? null


  useEffect(() => {
    (async () => {
      if (!pin) return

      const u = await supabase.auth.getUser()
      if (!u.error && u.data.user) setMe(u.data.user.id)

      // find room by pin
      const r = await supabase.from('rooms').select('id,pin,status,owner_id').eq('pin', pin).single()
      if (r.error || !r.data) { alert('Room not found'); nav('/rooms'); return }
      if (r.data.status !== 'started') {
        // if not started, bounce back to lobby
        return nav(`/room/${pin}`)
      }
      setRoom({ id: r.data.id, pin: r.data.pin })
      setOwnerId(r.data.owner_id)

      // latest match for this room
      const m = await supabase
        .from('matches')
        .select('id')
        .eq('room_id', r.data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (m.error || !m.data) { alert('No match found'); return }
      setMatchId(m.data.id)

      // match players (include all fields your MP type expects)
      const mp = await supabase
        .from('match_players')
        .select('match_id,user_id,seat,life,deck_id,hand_count,library_count,graveyard_count,exile_count')
        .eq('match_id', m.data.id)
        .order('seat', { ascending: true })
      setPlayers(mp.data ?? [])

      // grab nicknames from room_players to display names
      const rp = await supabase
        .from('room_players')
        .select('user_id,nickname,seat')
        .eq('room_id', r.data.id)
      const map: Record<string, RP> = {}
      for (const row of rp.data ?? []) {
        map[row.user_id] = { user_id: row.user_id, nickname: row.nickname, seat: row.seat }
      }
      setNames(map)
    })()
  }, [pin, nav])

  async function endMatch() {
    if (!room || !matchId) return
    const m = await supabase.from('matches').update({ status: 'ended' }).eq('id', matchId)
    if (m.error) return alert(m.error.message)
    const up = await supabase.from('rooms').update({ status: 'open' }).eq('id', room.id)
    if (up.error) return alert(up.error.message)
    nav(`/room/${pin}`)
  }

  async function adjustMyLife(delta: number) {
    if (!myPlayer || !matchId || !me) return
    const newLife = (myPlayer.life ?? 40) + delta

    // optimistic UI
    setPlayers(prev =>
      prev.map(p => p.user_id === me ? { ...p, life: newLife } : p)
    )

    // persist
    const { error } = await supabase
      .from('match_players')
      .update({ life: newLife })
      .eq('match_id', matchId)
      .eq('user_id', me)

    if (error) {
      alert(error.message)
      // optional: reload from DB on failure
    }
  }

  async function startGame() {
    if (!matchId) return

    // Optimistic UI: initialize seated players
    setPlayers(prev =>
      prev.map(p =>
        p.seat != null ? { ...p, life: 40, hand_count: 0, library_count: 99, graveyard_count: 0, exile_count: 0 } : p
      )
    )

    // Persist
    const { error } = await supabase
      .from('match_players')
      .update({ life: 40, hand_count: 0, library_count: 99, graveyard_count: 0, exile_count: 0 })
    
      .eq('match_id', matchId)
      .not('seat', 'is', null) // only seated players
    if (error) alert(error.message)

    // materialize per-card libraries based on deck lists
    await materializeLibraries(matchId, players.filter(p => p.seat != null))
  }


  async function materializeLibraries(matchId: string, seated: MP[]) {
    // clear any previous cards (safe if restarting)
    await supabase.from('match_cards').delete().eq('match_id', matchId)

    for (const p of seated) {
      if (!p.deck_id || !p.user_id || p.seat == null) continue

      const dc = await supabase
        .from('deck_cards')
        .select('card_name,count,is_commander,set_code,collector_number')
        .eq('deck_id', p.deck_id)

      const rows = dc.data ?? []
      const library: any[] = []
      let commander: any | null = null

      for (const r of rows) {
        if (r.is_commander) {
          // commander: one instance in 'command' zone
          commander = {
            match_id: matchId,
            owner_user_id: p.user_id,
            deck_id: p.deck_id,
            card_name: r.card_name,
            set_code: r.set_code ?? null,
            collector_number: r.collector_number ?? null,
            zone: 'command',
            library_index: null
          }
        } else {
          const n = Number(r.count || 0)
          for (let i = 0; i < n; i++) {
            library.push({
              match_id: matchId,
              owner_user_id: p.user_id,
              deck_id: p.deck_id,
              card_name: r.card_name,
              set_code: r.set_code ?? null,
              collector_number: r.collector_number ?? null,
              zone: 'library',
              library_index: null
            })
          }
        }
      }

      shuffleInPlace(library)
      // assign indexes (1 = top)
      library.forEach((row, idx) => { row.library_index = idx + 1 })

      const batch = commander ? [commander, ...library] : library
      if (batch.length) {
        const ins = await supabase.from('match_cards').insert(batch)
        if (ins.error) throw ins.error
      }
    }
  }

  async function adjustMyZone(
    zone: 'graveyard_count' | 'exile_count',
    delta: number
  ) {
    if (!myPlayer || !matchId || !me) return
    const cur = (myPlayer as any)[zone] ?? 0
    const next = Math.max(0, cur + delta)

    // optimistic UI
    setPlayers(prev =>
      prev.map(p => p.user_id === me ? { ...p, [zone]: next } as MP : p)
    )

    // persist
    const { error } = await supabase
      .from('match_players')
      .update({ [zone]: next })
      .eq('match_id', matchId)
      .eq('user_id', me)

    if (error) alert(error.message)
  }

  async function drawOne() {
    if (!myPlayer || !matchId || !me) return

    // 1) fetch top card
    const top = await supabase
      .from('match_cards')
      .select('id,card_name,library_index')
      .eq('match_id', matchId)
      .eq('owner_user_id', me)
      .eq('zone', 'library')
      .order('library_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (top.error) return alert(top.error.message)
    if (!top.data) return // nothing to draw

    // 2) optimistic counts
    const curLib  = myPlayer.library_count ?? 0
    const curHand = myPlayer.hand_count ?? 0
    const nextLib  = Math.max(0, curLib - 1)
    const nextHand = curHand + 1
    setPlayers(prev => prev.map(p =>
      p.user_id === me ? { ...p, library_count: nextLib, hand_count: nextHand } : p
    ))

    // 3) persist counts + move the card to hand
    const [u1, u2] = await Promise.all([
      supabase.from('match_players')
        .update({ library_count: nextLib, hand_count: nextHand })
        .eq('match_id', matchId).eq('user_id', me),
      supabase.from('match_cards')
        .update({ zone: 'hand', library_index: null })
        .eq('id', top.data.id)
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }


  async function discardOne() {
    if (!myPlayer || !matchId || !me) return

    // pick one hand card (first)
    const one = await supabase
      .from('match_cards')
      .select('id')
      .eq('match_id', matchId)
      .eq('owner_user_id', me)
      .eq('zone', 'hand')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const curHand = myPlayer.hand_count ?? 0
    if (curHand <= 0) return

    const curGY    = myPlayer.graveyard_count ?? 0
    const nextHand = curHand - 1
    const nextGY   = curGY + 1

    // optimistic counts
    setPlayers(prev =>
      prev.map(p =>
        p.user_id === me ? { ...p, hand_count: nextHand, graveyard_count: nextGY } : p
      )
    )

    const [u1, u2] = await Promise.all([
      supabase.from('match_players')
        .update({ hand_count: nextHand, graveyard_count: nextGY })
        .eq('match_id', matchId).eq('user_id', me),
      one.data
        ? supabase.from('match_cards').update({ zone: 'graveyard' }).eq('id', one.data.id)
        : Promise.resolve({ error: null } as any)
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }


async function mulligan() {
  if (!myPlayer || !matchId || !me) return
  const giveBack = myPlayer.hand_count ?? 0
  if (giveBack === 0) return

  // Optimistic UI
  setPlayers(prev =>
    prev.map(p =>
      p.user_id === me
        ? { ...p, hand_count: 0, library_count: (p.library_count ?? 0) + giveBack }
        : p
    )
  )

  // Persist
  const { error } = await supabase
    .from('match_players')
    .update({
      hand_count: 0,
      library_count: (myPlayer.library_count ?? 0) + giveBack,
    })
    .eq('match_id', matchId)
    .eq('user_id', me)

  if (error) alert(error.message)
}

  useEffect(() => {
    if (!matchId) return

    const channel = supabase
      .channel(`mp-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_players',
          filter: `match_id=eq.${matchId}`,
        },
        (payload: any) => {
          const type = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          const rowNew = payload.new as MP | undefined
          const rowOld = payload.old as MP | undefined

          setPlayers((prev) => {
            // work on a copy
            let next = [...prev]

            if (type === 'INSERT' || type === 'UPDATE') {
              if (!rowNew) return prev
              const i = next.findIndex(p => p.user_id === rowNew.user_id)
              if (i >= 0) next[i] = { ...next[i], ...rowNew }
              else next.push(rowNew)
            } else if (type === 'DELETE') {
              if (!rowOld) return prev
              next = next.filter(p => p.user_id !== rowOld.user_id)
            }

            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId || !me) return
    let ch: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      // initial load
      const h = await supabase
        .from('match_cards')
        .select('id,card_name,set_code,collector_number')
        .eq('match_id', matchId)
        .eq('owner_user_id', me)
        .eq('zone', 'hand')
        .order('created_at', { ascending: true })
      setMyHand(h.data ?? [])

      // realtime (optional but nice)
      ch = supabase
        .channel(`hand-${matchId}-${me}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'match_cards', filter: `match_id=eq.${matchId}` },
          (payload: any) => {
            const rowNew = payload.new as any
            const rowOld = payload.old as any
            // only care about my cards
            const isMine = (rowNew?.owner_user_id ?? rowOld?.owner_user_id) === me
            if (!isMine) return

            setMyHand(prev => {
              let next = prev.slice()
              if (payload.eventType === 'INSERT') {
                if (rowNew.zone === 'hand') next.push({ id: rowNew.id, card_name: rowNew.card_name, set_code: rowNew.set_code, collector_number: rowNew.collector_number })
              } else if (payload.eventType === 'UPDATE') {
                const wasInHand = prev.findIndex(c => c.id === rowOld.id) >= 0
                const isInHand  = rowNew.zone === 'hand'
                // remove old
                if (wasInHand) next = next.filter(c => c.id !== rowOld.id)
                // add new
                if (isInHand) next.push({ id: rowNew.id, card_name: rowNew.card_name, set_code: rowNew.set_code, collector_number: rowNew.collector_number })
              } else if (payload.eventType === 'DELETE') {
                next = next.filter(c => c.id !== rowOld.id)
              }
              return next
            })
          }
        )
        .subscribe()
    })()

    return () => { if (ch) supabase.removeChannel(ch) }
  }, [matchId, me])

  return (
    <div className="container wide">
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="row" style={{alignItems:'center'}}>
          <h2 style={{margin:0}}>Table — Room {pin}</h2>
          <div className="spacer" />
          {isOwner && (
            <>
              <button className="btn" onClick={startGame} style={{ marginRight: 8 }}>
                Start Game
              </button>
              <button className="btn danger" onClick={endMatch} style={{ marginRight: 8 }}>
                End Match
              </button>
            </>
          )}
          <button className="btn ghost" onClick={() => nav(`/room/${pin}`)}>Back to Lobby</button>
        </div>

        <div className="card" style={{ background: '#0f0f0f' }}>
          <h3 style={{ marginTop: 0 }}>Table</h3>
          <div className="table-root">
            {/* Top (Seat 1) */}
            <div className="seat seat-1">
              <div className="seat-name">{seats[0].name}</div>
              <div className="seat-meta">
                Life: {seats[0].life ?? '—'} • Hand: {seats[0].hand ?? '—'} • Library: {seats[0].library ?? '—'} • GY: {seats[0].graveyard ?? '—'} • Exile: {seats[0].exile ?? '—'} • Deck: {seats[0].deck ? '✓' : '—'}
              </div>
              {mySeat === 1 && (
                <div className="life-controls">
                  <button className="btn mini" onClick={() => adjustMyLife(-5)}>-5</button>
                  <button className="btn mini" onClick={() => adjustMyLife(-1)}>-1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+1)}>+1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+5)}>+5</button>
                  <button className="btn mini" onClick={drawOne}>Draw 1</button>
                  <button
                    className="btn mini"
                    onClick={discardOne}
                    disabled={(myPlayer?.hand_count ?? 0) <= 0}
                  >
                    Discard 1
                  </button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>+GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>-GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>+Exile</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>-Exile</button>
                  <button
                    className="btn mini"
                    onClick={mulligan}
                    disabled={(myPlayer?.hand_count ?? 0) === 0}
                    title="Return your hand to library and shuffle (counts-only)"
                  >
                    Mulligan
                  </button>
                  <div className="hand-list">
                    <b>My Hand:</b> {myHand.length ? myHand.map(c => c.card_name).join(', ') : '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Right (Seat 2) */}
            <div className="seat seat-2">
              <div className="seat-name">{seats[1].name}</div>
              <div className="seat-meta">
                Life: {seats[1].life ?? '—'} • Hand: {seats[1].hand ?? '—'} • Library: {seats[1].library ?? '—'} • GY: {seats[1].graveyard ?? '—'} • Exile: {seats[1].exile ?? '—'} • Deck: {seats[1].deck ? '✓' : '—'}
              </div>
              {mySeat === 2 && (
                <div className="life-controls">
                  <button className="btn mini" onClick={() => adjustMyLife(-5)}>-5</button>
                  <button className="btn mini" onClick={() => adjustMyLife(-1)}>-1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+1)}>+1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+5)}>+5</button>
                  <button className="btn mini" onClick={drawOne}>Draw 1</button>
                  <button
                    className="btn mini"
                    onClick={discardOne}
                    disabled={(myPlayer?.hand_count ?? 0) <= 0}
                  >
                    Discard 1
                  </button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>+GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>-GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>+Exile</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>-Exile</button>
                  <button
                    className="btn mini"
                    onClick={mulligan}
                    disabled={(myPlayer?.hand_count ?? 0) === 0}
                    title="Return your hand to library and shuffle (counts-only)"
                  >
                    Mulligan
                  </button>
                  <div className="hand-list">
                    <b>My Hand:</b> {myHand.length ? myHand.map(c => c.card_name).join(', ') : '—'}
                  </div>
                </div>
              )}

            </div>

            {/* Bottom (Seat 3) */}
            <div className="seat seat-3">
              <div className="seat-name">{seats[2].name}</div>
              <div className="seat-meta">
                Life: {seats[2].life ?? '—'} • Hand: {seats[2].hand ?? '—'} • Library: {seats[2].library ?? '—'} • GY: {seats[2].graveyard ?? '—'} • Exile: {seats[2].exile ?? '—'} • Deck: {seats[2].deck ? '✓' : '—'}
              </div>
              {mySeat === 3 && (
                <div className="life-controls">
                  <button className="btn mini" onClick={() => adjustMyLife(-5)}>-5</button>
                  <button className="btn mini" onClick={() => adjustMyLife(-1)}>-1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+1)}>+1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+5)}>+5</button>
                  <button className="btn mini" onClick={drawOne}>Draw 1</button>
                  <button
                    className="btn mini"
                    onClick={discardOne}
                    disabled={(myPlayer?.hand_count ?? 0) <= 0}
                  >
                    Discard 1
                  </button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>+GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>-GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>+Exile</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>-Exile</button>
                  <button
                    className="btn mini"
                    onClick={mulligan}
                    disabled={(myPlayer?.hand_count ?? 0) === 0}
                    title="Return your hand to library and shuffle (counts-only)"
                  >
                    Mulligan
                  </button>
                  <div className="hand-list">
                    <b>My Hand:</b> {myHand.length ? myHand.map(c => c.card_name).join(', ') : '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Left (Seat 4) */}
            <div className="seat seat-4">
              <div className="seat-name">{seats[3].name}</div>
              <div className="seat-meta">
                Life: {seats[3].life ?? '—'} • Hand: {seats[3].hand ?? '—'} • Library: {seats[3].library ?? '—'} • GY: {seats[3].graveyard ?? '—'} • Exile: {seats[3].exile ?? '—'} • Deck: {seats[3].deck ? '✓' : '—'}
              </div>
              {mySeat === 4 && (
                <div className="life-controls">
                  <button className="btn mini" onClick={() => adjustMyLife(-5)}>-5</button>
                  <button className="btn mini" onClick={() => adjustMyLife(-1)}>-1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+1)}>+1</button>
                  <button className="btn mini" onClick={() => adjustMyLife(+5)}>+5</button>
                  <button className="btn mini" onClick={drawOne}>Draw 1</button>
                  <button
                    className="btn mini"
                    onClick={discardOne}
                    disabled={(myPlayer?.hand_count ?? 0) <= 0}
                  >
                    Discard 1
                  </button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>+GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>-GY</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>+Exile</button>
                  <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>-Exile</button>
                  <button
                    className="btn mini"
                    onClick={mulligan}
                    disabled={(myPlayer?.hand_count ?? 0) === 0}
                    title="Return your hand to library and shuffle (counts-only)"
                  >
                    Mulligan
                  </button>
                  <div className="hand-list">
                    <b>My Hand:</b> {myHand.length ? myHand.map(c => c.card_name).join(', ') : '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Center placeholder */}
            <div className="table-center">Battlefield (coming soon)</div>
          </div>
        </div>

        <div className="card" style={{background:'#161616'}}>
          <h3 style={{marginTop:0}}>Players</h3>
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))'}}>
            {players.map(p => (
              <div key={p.user_id} className="card" style={{padding:12}}>
                <div><b>Seat {p.seat ?? '—'}</b></div>
                <div>Name: {names[p.user_id]?.nickname ?? p.user_id.slice(0,8)}</div>
                <div>Life: {p.life}</div>
                <div>Deck: {p.deck_id ? 'selected' : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
