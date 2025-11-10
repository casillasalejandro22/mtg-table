import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function pin4() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export default function RoomsHome() {
  const nav = useNavigate()
  const [joinPin, setJoinPin] = useState('')
  const [nick, setNick] = useState('')

  async function createRoom() {
    const { data: { user }, error: meErr } = await supabase.auth.getUser()
    if (meErr || !user) return alert('Sign in first')

    // generate a unique PIN (retry on conflict)
    let pin = pin4()
    for (let i = 0; i < 5; i++) {
        const ins = await supabase
            .from('rooms')
            .insert({ pin, owner_id: user.id })
            .select('id,pin')
            .single()

        if (!ins.error && ins.data) {
            const room = ins.data
            await supabase.from('room_players').insert({
            room_id: room.id,
            user_id: user.id,
            nickname: nick || user.email?.split('@')[0] || 'Player',
            seat: 1,
            })
            nav(`/room/${room.pin}`)
            return
        }

        // duplicate PIN? try another; otherwise surface error
        const msg = ins.error?.message ?? ''
        if (/duplicate key/i.test(msg)) {
            pin = String(Math.floor(1000 + Math.random() * 9000))
            continue
        } else {
            console.error('Create room failed:', ins.error)
            alert(ins.error?.message || 'Create failed')
            return
        }
        }
        alert('Could not allocate a room PIN. Try again.')

  }

  async function joinRoom() {
    const pin = joinPin.trim()
    if (!pin.match(/^\d{4}$/)) return alert('Enter a 4-digit PIN')

    const rm = await supabase.from('rooms').select('id,pin,status').eq('pin', pin).single()
    if (rm.error || !rm.data) return alert('Room not found')
    if (rm.data.status !== 'open') return alert('Room is not open')

    const { data: { user }, error: meErr } = await supabase.auth.getUser()
    if (meErr || !user) return alert('Sign in first')

    // pick first free seat 1..4
    const cur = await supabase.from('room_players').select('seat').eq('room_id', rm.data.id)
    const used = new Set((cur.data ?? []).map(r => r.seat))
    const seat = [1,2,3,4].find(s => !used.has(s)) ?? null
    if (!seat) return alert('Room is full')

    // upsert yourself
    await supabase.from('room_players').upsert({
      room_id: rm.data.id,
      user_id: user.id,
      nickname: nick || user.email?.split('@')[0] || 'Player',
      seat
    }, { onConflict: 'room_id,user_id' })

    nav(`/room/${rm.data.pin}`)
  }

  return (
    <div className="container">
      <div className="card" style={{display:'grid', gap:12, maxWidth:560}}>
        <h2 style={{margin:0}}>Rooms</h2>
        <input placeholder="Nickname (optional)" value={nick} onChange={e=>setNick(e.target.value)} />
        <div className="row">
          <button className="btn" onClick={createRoom}>Create room</button>
          <div className="spacer" />
          <input placeholder="Enter 4-digit PIN" value={joinPin} onChange={e=>setJoinPin(e.target.value)} style={{maxWidth:140}} />
          <button className="btn" onClick={joinRoom}>Join</button>
        </div>
      </div>
    </div>
  )
}
