// src/pages/RoomLobby.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Room = { id: string; pin: string; owner_id: string; status: string }
type Player = {
  id: string
  room_id: string
  user_id: string
  nickname: string
  deck_id: string | null
  is_ready: boolean
  seat: number | null
}
type MyDeck = { id: string; name: string; valid: boolean }

export default function RoomLobby() {
  const { pin } = useParams()
  const nav = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [myDecks, setMyDecks] = useState<MyDeck[]>([])

  const allReady = useMemo(
    () => players.length > 0 && players.every(p => p.is_ready),
    [players]
  )
  const allHaveDecks = useMemo(
    () => players.length > 0 && players.every(p => !!p.deck_id),
    [players]
  )
  const validDeckIds = useMemo(
    () => new Set(myDecks.filter(d => d.valid).map(d => d.id)),
    [myDecks]
  )
  const isOwner = room && me ? room.owner_id === me : false

  useEffect(() => {
    let unsubbed = false
    let chPlayers: ReturnType<typeof supabase.channel> | null = null
    let chRoom: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      if (!pin) return

      // who am I + my decks (+ validity)
      const meRes = await supabase.auth.getUser()
      if (!meRes.error && meRes.data.user) {
        const uid = meRes.data.user.id
        setMe(uid)

        const dks = await supabase
          .from('decks')
          .select('id,name')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })

        const base: { id: string; name: string }[] = dks.data ?? []
        if (base.length) {
          const ids = base.map(d => d.id)
          const cards = await supabase
            .from('deck_cards')
            .select('deck_id,is_commander,count')
            .in('deck_id', ids)

          const agg = new Map<string, { main: number; cmdRows: number; cmdCount: number }>()
          for (const r of (cards.data ?? []) as any[]) {
            const key = r.deck_id as string
            const a = agg.get(key) ?? { main: 0, cmdRows: 0, cmdCount: 0 }
            if (r.is_commander) { a.cmdRows += 1; a.cmdCount += Number(r.count || 0) }
            else { a.main += Number(r.count || 0) }
            agg.set(key, a)
          }

          const withValid: MyDeck[] = base.map(d => {
            const a = agg.get(d.id) ?? { main: 0, cmdRows: 0, cmdCount: 0 }
            const valid = (a.cmdRows === 1 && a.cmdCount === 1 && a.main === 99)
            return { id: d.id, name: d.name, valid }
          })
          setMyDecks(withValid)
        } else {
          setMyDecks([])
        }
      }

      // load room
      const r = await supabase
        .from('rooms')
        .select('id,pin,owner_id,status')
        .eq('pin', pin)
        .single()

      if (unsubbed) return

      if (r.error || !r.data) {
        alert('Room not found')
        nav('/rooms')
        return
      }
      setRoom(r.data as Room)

      await refreshPlayers(r.data.id)

      // realtime: players
      chPlayers = supabase
        .channel(`room-players:${r.data.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${r.data.id}` },
          () => refreshPlayers(r.data.id)
        )
        .subscribe()

      // realtime: room status
      chRoom = supabase
        .channel(`room:${r.data.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${r.data.id}` },
          (payload) => {
            const next = (payload.new as any)
            if (!next) return
            setRoom(prev => (prev ? { ...prev, status: next.status } : prev))
            if (next.status === 'closed') {
              alert('Room closed by owner.')
              nav('/rooms')
            } else if (next.status === 'started') {
              alert('Game starting… (table UI coming next)')
            }
          }
        )
        .subscribe()
    })()

    return () => {
      unsubbed = true
      if (chPlayers) supabase.removeChannel(chPlayers)
      if (chRoom) supabase.removeChannel(chRoom)
    }
  }, [pin, nav])

  async function refreshPlayers(roomId: string) {
    const ps = await supabase
      .from('room_players')
      .select('id,room_id,user_id,nickname,deck_id,is_ready,seat')
      .eq('room_id', roomId)
      .order('seat', { ascending: true })
    setPlayers(ps.data ?? [])
  }

  // Optimistic deck selection (but block invalid picks)
  async function chooseDeck(p: Player, deckId: string) {
    if (deckId && !validDeckIds.has(deckId)) {
      alert('That deck is not valid (needs 1 commander and 99 other cards).')
      return
    }
    const { data, error } = await supabase
      .from('room_players')
      .update({ deck_id: deckId || null })
      .eq('id', p.id)
      .select('id,deck_id')
      .single()

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }
    setPlayers(prev => prev.map(x => (x.id === p.id ? { ...x, deck_id: data.deck_id } : x)))
  }

  // Optimistic ready toggle (require valid deck)
  async function toggleReady(p: Player) {
    if (!p.is_ready) {
      if (!p.deck_id) return alert('Pick a deck first.')
      if (!validDeckIds.has(p.deck_id)) return alert('Pick a valid deck (1 commander + 99 others).')
    }
    const next = !p.is_ready
    setPlayers(prev => prev.map(x => (x.id === p.id ? { ...x, is_ready: next } : x)))
    const { error } = await supabase.from('room_players').update({ is_ready: next }).eq('id', p.id)
    if (error) {
      setPlayers(prev => prev.map(x => (x.id === p.id ? { ...x, is_ready: !next } : x)))
      console.error(error)
      alert(error.message)
    }
  }

  async function rename(p: Player, nickname: string) {
    const { error } = await supabase.from('room_players').update({ nickname }).eq('id', p.id)
    if (error) {
      console.error(error)
      alert(error.message)
    }
  }

  async function kickPlayer(p: Player) {
    if (!room) return
    const { error } = await supabase.from('room_players').delete().eq('id', p.id)
    if (error) {
      console.error(error)
      alert(error.message)
    }
  }

  async function startGame() {
    if (!room) return
    if (!allReady) return alert('Everyone must be ready')
    if (!allHaveDecks) return alert('Everyone must pick a deck')

    // 1) create a match (owner-only per RLS)
    const m = await supabase
        .from('matches')
        .insert({ room_id: room.id })
        .select('id')
        .single()
    if (m.error || !m.data) {
        console.error(m.error)
        return alert(m.error?.message ?? 'Failed to create match')
    }
    const matchId = m.data.id as string

    // 2) snapshot players into match_players with life=40
    const payload = players.map(p => ({
        match_id: matchId,
        user_id: p.user_id,
        seat: p.seat,
        deck_id: p.deck_id,   // already required earlier
        life: 40
    }))
    const mp = await supabase.from('match_players').insert(payload)
    if (mp.error) {
        console.error(mp.error)
        return alert(mp.error.message)
    }

    // 3) flip room to started (keeps your existing realtime)
    const up = await supabase.from('rooms').update({ status: 'started' }).eq('id', room.id)
    if (up.error) {
        console.error(up.error)
        return alert(up.error.message)
    }

    // 4) go to table
    nav(`/table/${room.pin}`)
    }

  async function closeRoom() {
    if (!room) return
    if (!confirm('Close this room for everyone?')) return
    const { error } = await supabase.from('rooms').update({ status: 'closed' }).eq('id', room.id)
    if (error) {
      console.error(error)
      alert(error.message)
      return
    }
    nav('/rooms')
  }

  async function leaveRoom() {
    if (!room || !me) return nav('/rooms')
    const mine = players.find(p => p.user_id === me)
    if (mine) {
      const { error } = await supabase.from('room_players').delete().eq('id', mine.id)
      if (error) {
        console.error(error)
        alert(error.message)
      }
    }
    nav('/rooms')
  }

  return (
    <div className="container">
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Room {pin}</h2>
          <div className="spacer" />
          {isOwner && (
            <button className="btn danger" onClick={closeRoom} style={{ marginRight: 8 }}>
              Close room
            </button>
          )}
          <button className="btn ghost" onClick={leaveRoom}>Leave</button>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div>Status: <b>{room?.status}</b></div>
          <div>Players: {players.length}/4</div>
          <div>All ready: {allReady ? '✅' : '⏳'}</div>
        </div>

        <div className="card" style={{ background: '#161616' }}>
          <h3 style={{ marginTop: 0 }}>Lobby</h3>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
            {players.map(p => {
              const itsMe = me === p.user_id
              const myReady = p.is_ready
              const myDeckValid = p.deck_id ? validDeckIds.has(p.deck_id) : false

              return (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      value={p.nickname ?? ''}
                      onChange={e => rename(p, e.target.value)}
                      disabled={!itsMe || myReady}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {itsMe ? (
                      <select
                        value={p.deck_id ?? ''}
                        onChange={e => chooseDeck(p, e.target.value)}
                        disabled={myReady}
                        style={{ width: '100%' }}
                      >
                        <option value="">
                          {myDecks.some(d => d.valid) ? 'Choose deck…' : 'No valid decks'}
                        </option>
                        {myDecks.filter(d => d.valid).map(d =>
                          <option key={d.id} value={d.id}>{d.name}</option>
                        )}
                      </select>
                    ) : (
                      <div className={myDeckValid ? 'muted' : 'error'} title={p.deck_id || ''}>
                        Deck: {p.deck_id ? (myDeckValid ? 'selected' : 'invalid') : '—'}
                      </div>
                    )}
                  </div>

                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <span>Seat {p.seat ?? '—'}</span>
                    <div className="spacer" />
                    <button
                      className="btn mini"
                      onClick={() => toggleReady(p)}
                      disabled={!itsMe}
                      title={!itsMe ? 'Only this player can toggle' : (!p.is_ready && !p.deck_id ? 'Pick a deck first' : (!p.is_ready && !myDeckValid ? 'Pick a valid deck' : ''))}
                    >
                      {p.is_ready ? 'Unready' : 'Ready'}
                    </button>
                    {isOwner && !itsMe && (
                      <button className="btn mini danger" onClick={() => kickPlayer(p)}>
                        Kick
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div className="spacer" />
            <button
              className="btn"
              onClick={startGame}
              disabled={!isOwner || !allReady || !allHaveDecks || room?.status !== 'open'}
            >
              Start
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
