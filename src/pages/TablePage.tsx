import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Room = { id: string; pin: string }
type MP = { user_id: string; seat: number | null; life: number; deck_id: string | null }
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
  const isOwner = !!me && !!ownerId && me === ownerId


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

      // match players
      const mp = await supabase
        .from('match_players')
        .select('user_id,seat,life,deck_id')
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


  return (
    <div className="container">
      <div className="card" style={{display:'grid', gap:12}}>
        <div className="row" style={{alignItems:'center'}}>
          <h2 style={{margin:0}}>Table — Room {pin}</h2>
          <div className="spacer" />
          {isOwner && (
            <button className="btn danger" onClick={endMatch} style={{ marginRight: 8 }}>
              End Match
            </button>
          )}
          <button className="btn ghost" onClick={() => nav(`/room/${pin}`)}>Back to Lobby</button>
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

        <div className="muted">
          (Next steps: shuffle/deal 7, zones, actions. For now this page is just a snapshot.)
        </div>
      </div>
    </div>
  )
}
