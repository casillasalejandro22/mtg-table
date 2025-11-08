import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async () => {
    setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
  }

  const signIn = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  if (session) {
    return (
      <div style={{ padding: 16, display:'grid', gap:8 }}>
        <div>Signed in as <b>{session.user.email}</b></div>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display:'grid', gap:8, maxWidth:320 }}>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={signUp}>Sign up</button>
      <button onClick={signIn}>Sign in</button>
      {error && <div style={{ color:'salmon' }}>{error}</div>}
    </div>
  )
}
