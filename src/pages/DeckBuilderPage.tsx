import DeckImport from '../components/DeckImport'

export default function DeckBuilderPage() {
  return (
    <div className="container">
      <div className="card">
        <h2>Deck Builder</h2>
        <p className="muted">Paste lines like <code>1 Sol Ring</code>, then save. Use “My Decks” to view/edit later.</p>
        <DeckImport />
      </div>
    </div>
  )
}
