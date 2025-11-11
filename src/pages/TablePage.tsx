import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CardThumb from '../components/CardThumb'

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

  const [myHand, setMyHand] = useState<
    { id: string; card_name: string; set_code: string | null; collector_number: string | null }[]
  >([])

  const seats = useMemo(() => {
    const bySeat: Record<number, MP | null> = { 1: null, 2: null, 3: null, 4: null }
    for (const p of players) {
      if (p.seat && bySeat[p.seat] == null) bySeat[p.seat] = p
    }
    const withNames = (s: number) => {
      const p = bySeat[s]
      if (!p) {
        return {
          seat: s,
          name: 'Empty',
          life: null as number | null,
          deck: false,
          hand: null as number | null,
          library: null as number | null,
          graveyard: null as number | null,
          exile: null as number | null,
        }
      }
      const nick = names[p.user_id]?.nickname ?? p.user_id.slice(0, 8)
      return {
        seat: s,
        name: nick,
        life: p.life,
        deck: !!p.deck_id,
        hand: p.hand_count ?? 0,
        library: p.library_count ?? 0,
        graveyard: p.graveyard_count ?? 0,
        exile: p.exile_count ?? 0,
      }
    }
    return [withNames(1), withNames(2), withNames(3), withNames(4)]
  }, [players, names])

  const isOwner = !!me && !!ownerId && me === ownerId
  const myPlayer = useMemo(() => players.find(p => p.user_id === me) ?? null, [players, me])
  const mySeat = myPlayer?.seat ?? null

  // Fullscreen only for the table card
  const tableFSRef = useRef<HTMLDivElement>(null)
  const [isFS, setIsFS] = useState(false)
  const toggleFullscreen = async () => {
    const el = tableFSRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {})
    } else {
      await document.exitFullscreen().catch(() => {})
    }
  }
  useEffect(() => {
    const onChange = () => setIsFS(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Initial data load
  useEffect(() => {
    ;(async () => {
      if (!pin) return

      const u = await supabase.auth.getUser()
      if (!u.error && u.data.user) setMe(u.data.user.id)

      const r = await supabase.from('rooms').select('id,pin,status,owner_id').eq('pin', pin).single()
      if (r.error || !r.data) {
        alert('Room not found')
        nav('/rooms')
        return
      }
      if (r.data.status !== 'started') return nav(`/room/${pin}`)
      setRoom({ id: r.data.id, pin: r.data.pin })
      setOwnerId(r.data.owner_id)

      const m = await supabase
        .from('matches')
        .select('id')
        .eq('room_id', r.data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (m.error || !m.data) {
        alert('No match found')
        return
      }
      setMatchId(m.data.id)

      const mp = await supabase
        .from('match_players')
        .select(
          'match_id,user_id,seat,life,deck_id,hand_count,library_count,graveyard_count,exile_count'
        )
        .eq('match_id', m.data.id)
        .order('seat', { ascending: true })
      setPlayers(mp.data ?? [])

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

    setPlayers(prev => prev.map(p => (p.user_id === me ? { ...p, life: newLife } : p)))

    const { error } = await supabase
      .from('match_players')
      .update({ life: newLife })
      .eq('match_id', matchId)
      .eq('user_id', me)

    if (error) alert(error.message)
  }

  async function startGame() {
    if (!matchId) return

    setPlayers(prev =>
      prev.map(p =>
        p.seat != null
          ? { ...p, life: 40, hand_count: 0, library_count: 99, graveyard_count: 0, exile_count: 0 }
          : p
      )
    )

    const { error } = await supabase
      .from('match_players')
      .update({ life: 40, hand_count: 0, library_count: 99, graveyard_count: 0, exile_count: 0 })
      .eq('match_id', matchId)
      .not('seat', 'is', null)

    if (error) {
      alert(error.message)
      return
    }

    try {
      await materializeLibraries(matchId)
    } catch (e: any) {
      alert(`Materialize failed: ${e?.message ?? e}`)
      return
    }
    setMyHand([])
  }

  async function materializeLibraries(matchId: string) {
    const del = await supabase.from('match_cards').delete().eq('match_id', matchId)
    if (del.error) throw del.error

    const mp = await supabase
      .from('match_players')
      .select('user_id, seat, deck_id')
      .eq('match_id', matchId)
      .not('seat', 'is', null)
    if (mp.error) throw mp.error

    const seated = (mp.data ?? []).filter(p => !!p.user_id && !!p.deck_id)
    if (!seated.length) return

    for (const p of seated) {
      const owner = (p.user_id ?? '').toString().trim()
      const deckId = (p.deck_id ?? '').toString().trim()
      if (!owner || !deckId) continue

      const dc = await supabase
        .from('deck_cards')
        .select('card_name,count,is_commander,set_code,collector_number')
        .eq('deck_id', deckId)
      if (dc.error) throw dc.error

      const rows = dc.data ?? []
      const library: Array<{
        match_id: string
        owner_user_id: string
        user_id: string
        deck_id: string
        card_name: string
        set_code: string | null
        collector_number: string | null
        zone: 'library' | 'command'
        library_index: number | null
      }> = []

      let commander: typeof library[number] | null = null

      for (const r of rows) {
        const n = Number(r.count || 0)
        if (r.is_commander) {
          commander = {
            match_id: matchId,
            owner_user_id: owner,
            user_id: owner,
            deck_id: deckId,
            card_name: r.card_name,
            set_code: r.set_code ?? null,
            collector_number: r.collector_number ?? null,
            zone: 'command',
            library_index: null,
          }
        } else {
          for (let i = 0; i < n; i++) {
            library.push({
              match_id: matchId,
              owner_user_id: owner,
              user_id: owner,
              deck_id: deckId,
              card_name: r.card_name,
              set_code: r.set_code ?? null,
              collector_number: r.collector_number ?? null,
              zone: 'library',
              library_index: null,
            })
          }
        }
      }

      shuffleInPlace(library)
      library.forEach((row, idx) => {
        row.library_index = idx + 1
      })

      const batch = commander ? [commander, ...library] : library
      if (!batch.length) continue

      const ins = await supabase.from('match_cards').insert(batch)
      if (ins.error) throw ins.error
    }
  }

  async function adjustMyZone(zone: 'graveyard_count' | 'exile_count', delta: number) {
    if (!myPlayer || !matchId || !me) return
    const cur = (myPlayer as any)[zone] ?? 0
    const next = Math.max(0, cur + delta)

    setPlayers(prev => prev.map(p => (p.user_id === me ? ({ ...p, [zone]: next } as MP) : p)))

    const { error } = await supabase
      .from('match_players')
      .update({ [zone]: next })
      .eq('match_id', matchId)
      .eq('user_id', me)

    if (error) alert(error.message)
  }

  async function drawOne() {
    if (!myPlayer || !matchId || !me) return

    const top = await supabase
      .from('match_cards')
      .select('id,card_name,set_code,collector_number,library_index')
      .eq('match_id', matchId)
      .eq('user_id', me)
      .eq('zone', 'library')
      .order('library_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (top.error) return alert(top.error.message)
    if (!top.data) {
      alert('No cards in your library. Press “Start Game” again to initialize your deck.')
      return
    }

    const curLib = myPlayer.library_count ?? 0
    const curHand = myPlayer.hand_count ?? 0
    const nextLib = Math.max(0, curLib - 1)
    const nextHand = curHand + 1

    setPlayers(prev =>
      prev.map(p => (p.user_id === me ? { ...p, library_count: nextLib, hand_count: nextHand } : p))
    )

    const [u1, u2] = await Promise.all([
      supabase
        .from('match_players')
        .update({ library_count: nextLib, hand_count: nextHand })
        .eq('match_id', matchId)
        .eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'hand', library_index: null }).eq('id', top.data.id),
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }

  async function playFromHand(cardId: string) {
    if (!myPlayer || !matchId || !me) return
    const nextHand = Math.max(0, (myPlayer.hand_count ?? 0) - 1)

    setPlayers(prev => prev.map(p => (p.user_id === me ? { ...p, hand_count: nextHand } : p)))
    setMyHand(prev => prev.filter(c => c.id !== cardId))

    const [u1, u2] = await Promise.all([
      supabase.from('match_players').update({ hand_count: nextHand }).eq('match_id', matchId).eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'battlefield' }).eq('id', cardId),
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }

  async function discardCard(cardId: string) {
    if (!myPlayer || !matchId || !me) return
    const nextHand = Math.max(0, (myPlayer.hand_count ?? 0) - 1)
    const nextGY = (myPlayer.graveyard_count ?? 0) + 1

    setPlayers(prev =>
      prev.map(p =>
        p.user_id === me ? { ...p, hand_count: nextHand, graveyard_count: nextGY } : p
      )
    )
    setMyHand(prev => prev.filter(c => c.id !== cardId))

    const [u1, u2] = await Promise.all([
      supabase
        .from('match_players')
        .update({ hand_count: nextHand, graveyard_count: nextGY })
        .eq('match_id', matchId)
        .eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'graveyard' }).eq('id', cardId),
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }

  async function exileCard(cardId: string) {
    if (!myPlayer || !matchId || !me) return
    const nextHand = Math.max(0, (myPlayer.hand_count ?? 0) - 1)
    const nextExile = (myPlayer.exile_count ?? 0) + 1

    setPlayers(prev =>
      prev.map(p => (p.user_id === me ? { ...p, hand_count: nextHand, exile_count: nextExile } : p))
    )
    setMyHand(prev => prev.filter(c => c.id !== cardId))

    const [u1, u2] = await Promise.all([
      supabase
        .from('match_players')
        .update({ hand_count: nextHand, exile_count: nextExile })
        .eq('match_id', matchId)
        .eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'exile' }).eq('id', cardId),
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }

  async function discardOne() {
    if (!myPlayer || !matchId || !me) return

    const one = await supabase
      .from('match_cards')
      .select('id')
      .eq('match_id', matchId)
      .eq('user_id', me)
      .eq('zone', 'hand')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const curHand = myPlayer.hand_count ?? 0
    if (curHand <= 0) return

    const curGY = myPlayer.graveyard_count ?? 0
    const nextHand = curHand - 1
    const nextGY = curGY + 1

    setPlayers(prev =>
      prev.map(p => (p.user_id === me ? { ...p, hand_count: nextHand, graveyard_count: nextGY } : p))
    )

    const [u1, u2] = await Promise.all([
      supabase
        .from('match_players')
        .update({ hand_count: nextHand, graveyard_count: nextGY })
        .eq('match_id', matchId)
        .eq('user_id', me),
      one.data
        ? supabase.from('match_cards').update({ zone: 'graveyard' }).eq('id', one.data.id)
        : Promise.resolve({ error: null } as any),
    ])
    if (u1.error) alert(u1.error.message)
    if (u2.error) alert(u2.error.message)
  }

  async function moveHandToGY(cardId: string) {
    if (!myPlayer || !matchId || !me) return
    const curHand = myPlayer.hand_count ?? 0
    if (curHand <= 0) return
    const nextHand = curHand - 1
    const nextGY = (myPlayer.graveyard_count ?? 0) + 1

    setPlayers(prev =>
      prev.map(p => (p.user_id === me ? { ...p, hand_count: nextHand, graveyard_count: nextGY } : p))
    )
    setMyHand(prev => prev.filter(c => c.id !== cardId))

    const [uCounts, uCard] = await Promise.all([
      supabase
        .from('match_players')
        .update({ hand_count: nextHand, graveyard_count: nextGY })
        .eq('match_id', matchId)
        .eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'graveyard' }).eq('id', cardId),
    ])
    if (uCounts.error) alert(uCounts.error.message)
    if (uCard.error) alert(uCard.error.message)
  }

  async function moveHandToExile(cardId: string) {
    if (!myPlayer || !matchId || !me) return
    const curHand = myPlayer.hand_count ?? 0
    if (curHand <= 0) return
    const nextHand = curHand - 1
    const nextExile = (myPlayer.exile_count ?? 0) + 1

    setPlayers(prev =>
      prev.map(p => (p.user_id === me ? { ...p, hand_count: nextHand, exile_count: nextExile } : p))
    )
    setMyHand(prev => prev.filter(c => c.id !== cardId))

    const [uCounts, uCard] = await Promise.all([
      supabase
        .from('match_players')
        .update({ hand_count: nextHand, exile_count: nextExile })
        .eq('match_id', matchId)
        .eq('user_id', me),
      supabase.from('match_cards').update({ zone: 'exile' }).eq('id', cardId),
    ])
    if (uCounts.error) alert(uCounts.error.message)
    if (uCard.error) alert(uCard.error.message)
  }

  async function mulligan() {
    if (!myPlayer || !matchId || !me) return

    const hand = await supabase
      .from('match_cards')
      .select('id')
      .eq('match_id', matchId)
      .eq('user_id', me)
      .eq('zone', 'hand')

    const ids = (hand.data ?? []).map(r => r.id as string)
    const giveBack = ids.length
    if (giveBack === 0) return

    setPlayers(prev =>
      prev.map(p =>
        p.user_id === me
          ? { ...p, hand_count: 0, library_count: (p.library_count ?? 0) + giveBack }
          : p
      )
    )
    setMyHand([])

    const u1 = await supabase
      .from('match_cards')
      .update({ zone: 'library', library_index: null })
      .in('id', ids)
    if (u1.error) {
      alert(u1.error.message)
      return
    }

    // Reindex safely
    await supabase
      .from('match_cards')
      .update({ library_index: null })
      .eq('match_id', matchId)
      .eq('owner_user_id', me)
      .eq('zone', 'library')

    const libRows = await supabase
      .from('match_cards')
      .select('id, card_name, set_code, collector_number, deck_id, owner_user_id, user_id')
      .eq('match_id', matchId)
      .eq('owner_user_id', me)
      .eq('zone', 'library')

    const rows = libRows.data ?? []
    shuffleInPlace(rows)
    const updates = rows.map((row, idx) => ({
      id: row.id,
      match_id: matchId,
      deck_id: row.deck_id ?? null,
      owner_user_id: row.owner_user_id ?? me,
      user_id: row.user_id ?? me,
      card_name: row.card_name,
      zone: 'library',
      set_code: row.set_code ?? null,
      collector_number: row.collector_number ?? null,
      library_index: idx + 1,
    }))

    const u2 = await supabase.from('match_cards').upsert(updates, { onConflict: 'id' })
    if (u2.error) alert(u2.error.message)

    const { error: e3 } = await supabase
      .from('match_players')
      .update({
        hand_count: 0,
        library_count: (myPlayer.library_count ?? 0) + giveBack,
      })
      .eq('match_id', matchId)
      .eq('user_id', me)

    if (e3) alert(e3.message)
  }

  // realtime players
  useEffect(() => {
    if (!matchId) return
    const channel = supabase
      .channel(`mp-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` },
        (payload: any) => {
          const type = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          const rowNew = payload.new as MP | undefined
          const rowOld = payload.old as MP | undefined

          setPlayers(prev => {
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

  // my hand (initial + realtime)
  useEffect(() => {
    if (!matchId || !me) return
    let ch: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const h = await supabase
        .from('match_cards')
        .select('id,card_name,set_code,collector_number')
        .eq('match_id', matchId)
        .eq('user_id', me)
        .eq('zone', 'hand')
        .order('created_at', { ascending: true })
      setMyHand(h.data ?? [])

      ch = supabase
        .channel(`hand-${matchId}-${me}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_cards', filter: `match_id=eq.${matchId}` },
          (payload: any) => {
            const rowNew = payload.new as any | null
            const rowOld = payload.old as any | null
            const owner = (rowNew?.owner_user_id ?? rowOld?.owner_user_id) as string | undefined
            if (owner !== me) return
            const id = (rowNew?.id ?? rowOld?.id) as string | undefined

            setMyHand(prev => {
              let next = id ? prev.filter(c => c.id !== id) : prev.slice()
              if (rowNew && rowNew.zone === 'hand') {
                if (!next.some(c => c.id === rowNew.id)) {
                  next.push({
                    id: rowNew.id,
                    card_name: rowNew.card_name,
                    set_code: rowNew.set_code ?? null,
                    collector_number: rowNew.collector_number ?? null,
                  })
                }
              }
              return next
            })
          }
        )
        .subscribe()
    })()
    return () => {
      if (ch) supabase.removeChannel(ch)
    }
  }, [matchId, me])

  return (
    <div className="container table-container">
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Table — Room {pin}</h2>
          <div className="spacer" />
          {isOwner && (
            <>
              <button className="btn" onClick={startGame} style={{ marginRight: 8 }}>
                Start Game
              </button>
              <button className="btn danger" onClick={endMatch} style={{ marginRight: 8 }}>
                End Match
              </button>
              <button className="btn ghost" onClick={toggleFullscreen}>
                {isFS ? 'Exit Fullscreen' : 'Fullscreen Table'}
              </button>
            </>
          )}
          <button className="btn ghost" onClick={() => nav(`/room/${pin}`)}>
            Back to Lobby
          </button>
        </div>

        {/* --- TABLE: 4 QUADRANTS --- */}
        <div ref={tableFSRef} className="card table-card" style={{ background: '#0f0f0f' }}>
          <h3 style={{ marginTop: 0 }}>Table</h3>

          <div className="table-root grid-4">
            {/* Q1 — Seat 1 */}
            <div className="quad q1">
              <div className="seat-panel">
                <div className="seat-name">{seats[0].name}</div>
                <div className="seat-meta">
                  Life: {seats[0].life ?? '—'} • Hand: {seats[0].hand ?? '—'} • Library:{' '}
                  {seats[0].library ?? '—'} • GY: {seats[0].graveyard ?? '—'} • Exile:{' '}
                  {seats[0].exile ?? '—'} • Deck: {seats[0].deck ? '✓' : '—'}
                </div>

                {mySeat === 1 && (
                  <>
                    <div className="life-controls">
                      <button className="btn mini" onClick={() => adjustMyLife(-5)}>
                        -5
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(-1)}>
                        -1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+1)}>
                        +1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+5)}>
                        +5
                      </button>
                      <button className="btn mini" onClick={drawOne}>
                        Draw 1
                      </button>
                      <button
                        className="btn mini"
                        onClick={discardOne}
                        disabled={(myPlayer?.hand_count ?? 0) <= 0}
                      >
                        Discard 1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>
                        +GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>
                        -GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>
                        +Exile
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>
                        -Exile
                      </button>
                      <button
                        className="btn mini"
                        onClick={mulligan}
                        disabled={(myPlayer?.hand_count ?? 0) === 0}
                        title="Return your hand to library and shuffle"
                      >
                        Mulligan
                      </button>
                    </div>

                    <div className="hand-rail">
                      {myHand.length === 0 ? (
                        <div className="muted" style={{ alignSelf: 'center' }}>
                          No cards in hand
                        </div>
                      ) : (
                        myHand.map(c => (
                          <div key={c.id} className="hand-card">
                            <CardThumb
                              name={c.card_name}
                              set={c.set_code ?? undefined}
                              number={c.collector_number ?? undefined}
                              size="sm"
                            />
                            <div className="hand-actions">
                              <button className="btn mini" onClick={() => playFromHand(c.id)}>
                                Play
                              </button>
                              <button className="btn mini" onClick={() => moveHandToGY(c.id)}>
                                GY
                              </button>
                              <button className="btn mini" onClick={() => moveHandToExile(c.id)}>
                                Exile
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="quad-bf" data-seat="1">Battlefield — Seat 1 (coming soon)</div>
            </div>

            {/* Q2 — Seat 2 */}
            <div className="quad q2">
              <div className="seat-panel">
                <div className="seat-name">{seats[1].name}</div>
                <div className="seat-meta">
                  Life: {seats[1].life ?? '—'} • Hand: {seats[1].hand ?? '—'} • Library:{' '}
                  {seats[1].library ?? '—'} • GY: {seats[1].graveyard ?? '—'} • Exile:{' '}
                  {seats[1].exile ?? '—'} • Deck: {seats[1].deck ? '✓' : '—'}
                </div>

                {mySeat === 2 && (
                  <>
                    <div className="life-controls">
                      <button className="btn mini" onClick={() => adjustMyLife(-5)}>
                        -5
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(-1)}>
                        -1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+1)}>
                        +1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+5)}>
                        +5
                      </button>
                      <button className="btn mini" onClick={drawOne}>
                        Draw 1
                      </button>
                      <button
                        className="btn mini"
                        onClick={discardOne}
                        disabled={(myPlayer?.hand_count ?? 0) <= 0}
                      >
                        Discard 1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>
                        +GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>
                        -GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>
                        +Exile
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>
                        -Exile
                      </button>
                      <button
                        className="btn mini"
                        onClick={mulligan}
                        disabled={(myPlayer?.hand_count ?? 0) === 0}
                        title="Return your hand to library and shuffle"
                      >
                        Mulligan
                      </button>
                    </div>

                    <div className="hand-rail">
                      {myHand.length === 0 ? (
                        <div className="muted" style={{ alignSelf: 'center' }}>
                          No cards in hand
                        </div>
                      ) : (
                        myHand.map(c => (
                          <div key={c.id} className="hand-card">
                            <CardThumb
                              name={c.card_name}
                              set={c.set_code ?? undefined}
                              number={c.collector_number ?? undefined}
                              size="sm"
                            />
                            <div className="hand-actions">
                              <button className="btn mini" onClick={() => playFromHand(c.id)}>
                                Play
                              </button>
                              <button className="btn mini" onClick={() => moveHandToGY(c.id)}>
                                GY
                              </button>
                              <button className="btn mini" onClick={() => moveHandToExile(c.id)}>
                                Exile
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="quad-bf" data-seat="2">Battlefield — Seat 2 (coming soon)</div>
            </div>

            {/* Q3 — Seat 3 */}
            <div className="quad q3">
              <div className="seat-panel">
                <div className="seat-name">{seats[2].name}</div>
                <div className="seat-meta">
                  Life: {seats[2].life ?? '—'} • Hand: {seats[2].hand ?? '—'} • Library:{' '}
                  {seats[2].library ?? '—'} • GY: {seats[2].graveyard ?? '—'} • Exile:{' '}
                  {seats[2].exile ?? '—'} • Deck: {seats[2].deck ? '✓' : '—'}
                </div>

                {mySeat === 3 && (
                  <>
                    <div className="life-controls">
                      <button className="btn mini" onClick={() => adjustMyLife(-5)}>
                        -5
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(-1)}>
                        -1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+1)}>
                        +1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+5)}>
                        +5
                      </button>
                      <button className="btn mini" onClick={drawOne}>
                        Draw 1
                      </button>
                      <button
                        className="btn mini"
                        onClick={discardOne}
                        disabled={(myPlayer?.hand_count ?? 0) <= 0}
                      >
                        Discard 1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>
                        +GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>
                        -GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>
                        +Exile
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>
                        -Exile
                      </button>
                      <button
                        className="btn mini"
                        onClick={mulligan}
                        disabled={(myPlayer?.hand_count ?? 0) === 0}
                        title="Return your hand to library and shuffle"
                      >
                        Mulligan
                      </button>
                    </div>

                    <div className="hand-rail">
                      {myHand.length === 0 ? (
                        <div className="muted" style={{ alignSelf: 'center' }}>
                          No cards in hand
                        </div>
                      ) : (
                        myHand.map(c => (
                          <div key={c.id} className="hand-card">
                            <CardThumb
                              name={c.card_name}
                              set={c.set_code ?? undefined}
                              number={c.collector_number ?? undefined}
                              size="sm"
                            />
                            <div className="hand-actions">
                              <button className="btn mini" onClick={() => playFromHand(c.id)}>
                                Play
                              </button>
                              <button className="btn mini" onClick={() => moveHandToGY(c.id)}>
                                GY
                              </button>
                              <button className="btn mini" onClick={() => moveHandToExile(c.id)}>
                                Exile
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="quad-bf" data-seat="3">Battlefield — Seat 3 (coming soon)</div>
            </div>

            {/* Q4 — Seat 4 */}
            <div className="quad q4">
              <div className="seat-panel">
                <div className="seat-name">{seats[3].name}</div>
                <div className="seat-meta">
                  Life: {seats[3].life ?? '—'} • Hand: {seats[3].hand ?? '—'} • Library:{' '}
                  {seats[3].library ?? '—'} • GY: {seats[3].graveyard ?? '—'} • Exile:{' '}
                  {seats[3].exile ?? '—'} • Deck: {seats[3].deck ? '✓' : '—'}
                </div>

                {mySeat === 4 && (
                  <>
                    <div className="life-controls">
                      <button className="btn mini" onClick={() => adjustMyLife(-5)}>
                        -5
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(-1)}>
                        -1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+1)}>
                        +1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyLife(+5)}>
                        +5
                      </button>
                      <button className="btn mini" onClick={drawOne}>
                        Draw 1
                      </button>
                      <button
                        className="btn mini"
                        onClick={discardOne}
                        disabled={(myPlayer?.hand_count ?? 0) <= 0}
                      >
                        Discard 1
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', +1)}>
                        +GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('graveyard_count', -1)}>
                        -GY
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', +1)}>
                        +Exile
                      </button>
                      <button className="btn mini" onClick={() => adjustMyZone('exile_count', -1)}>
                        -Exile
                      </button>
                      <button
                        className="btn mini"
                        onClick={mulligan}
                        disabled={(myPlayer?.hand_count ?? 0) === 0}
                        title="Return your hand to library and shuffle"
                      >
                        Mulligan
                      </button>
                    </div>

                    <div className="hand-rail">
                      {myHand.length === 0 ? (
                        <div className="muted" style={{ alignSelf: 'center' }}>
                          No cards in hand
                        </div>
                      ) : (
                        myHand.map(c => (
                          <div key={c.id} className="hand-card">
                            <CardThumb
                              name={c.card_name}
                              set={c.set_code ?? undefined}
                              number={c.collector_number ?? undefined}
                              size="sm"
                            />
                            <div className="hand-actions">
                              <button className="btn mini" onClick={() => playFromHand(c.id)}>
                                Play
                              </button>
                              <button className="btn mini" onClick={() => moveHandToGY(c.id)}>
                                GY
                              </button>
                              <button className="btn mini" onClick={() => moveHandToExile(c.id)}>
                                Exile
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="quad-bf" data-seat="4">Battlefield — Seat 4 (coming soon)</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ background: '#161616' }}>
          <h3 style={{ marginTop: 0 }}>Players</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
            {players.map(p => (
              <div key={p.user_id} className="card" style={{ padding: 12 }}>
                <div>
                  <b>Seat {p.seat ?? '—'}</b>
                </div>
                <div>Name: {names[p.user_id]?.nickname ?? p.user_id.slice(0, 8)}</div>
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
