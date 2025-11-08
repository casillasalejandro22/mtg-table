export type CardInfo = { small: string; normal: string; type_line: string }

function key(name: string) { return 'sf:info:' + name.toLowerCase().trim() }

export async function getCardInfo(name: string): Promise<CardInfo | null> {
  const k = key(name)
  const cached = localStorage.getItem(k)
  if (cached) return JSON.parse(cached)

  const fetchNamed = async (mode: 'exact' | 'fuzzy') => {
    const r = await fetch(`https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(name)}`)
    return r.ok ? r.json() : null
  }

  let data = await fetchNamed('exact')
  if (!data) data = await fetchNamed('fuzzy')
  if (!data) return null

  const iu = data.image_uris ?? data.card_faces?.[0]?.image_uris
  const type_line = data.type_line ?? data.card_faces?.[0]?.type_line ?? ''
  if (!iu?.small || !iu?.normal) return null

  const info: CardInfo = { small: iu.small, normal: iu.normal, type_line }
  localStorage.setItem(k, JSON.stringify(info))
  return info
}
