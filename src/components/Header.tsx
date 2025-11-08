import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Header() {
  const loc = useLocation()
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    navigate('/') // go to builder
    window.location.reload()
  }

  const tab = (path: string, label: string) =>
    <Link className={`tab ${loc.pathname === path ? 'active' : ''}`} to={path}>{label}</Link>

  return (
    <header className="header">
      <div className="brand">MTG Table</div>
      <nav className="nav">
        {tab('/', 'Deck Builder')}
        {tab('/decks', 'My Decks')}
      </nav>
      <button className="btn" onClick={signOut}>Sign out</button>
    </header>
  )
}
