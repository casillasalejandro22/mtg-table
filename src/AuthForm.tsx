import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const signUp = async () => {
    setErr(null)
    const { error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) setErr(error.message)
  }
  const signIn = async () => {
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr(error.message)
  }

  return (
    <div style={{ padding:16, display:'grid', gap:8, maxWidth:320 }}>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={signUp}>Sign up</button>
      <button onClick={signIn}>Sign in</button>
      {err && <div style={{ color:'salmon' }}>{err}</div>}
    </div>
  )
}
