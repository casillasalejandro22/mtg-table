import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import AuthForm from './AuthForm'
import DeckImport from './components/DeckImport'
import MyDecks from './components/MyDecks'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (!session) return <AuthForm />

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, padding:16 }}>
      <DeckImport />
      <MyDecks />
    </div>
  )
}
