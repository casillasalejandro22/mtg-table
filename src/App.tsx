import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import AuthForm from './AuthForm'
import Header from './components/Header'
import DeckBuilderPage from './pages/DeckBuilderPage'
import MyDecksPage from './pages/MyDecksPage'
import DeckViewPage from './pages/DeckViewPage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (!session) return (
    <div className="container"><div className="card"><h2>Sign in</h2><AuthForm /></div></div>
  )

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<DeckBuilderPage />} />
        <Route path="/decks" element={<MyDecksPage />} />
        <Route path="/deck/:id" element={<DeckViewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
