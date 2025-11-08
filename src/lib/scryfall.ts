export type ImgPair = { small: string; normal: string }
export type CardInfo = ImgPair & { type_line: string }

function key(name: string, suffix = 'info') {
  return `sf:${suffix}:${name.toLowerCase().trim()}`
}

async function fetchNamed(name: string) {
  const exact = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
  if (exact.ok) return exact.json()
  const fuzzy = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
  return fuzzy.ok ? fuzzy.json() : null
}

export async function getCardInfo(name: string): Promise<CardInfo | null> {
  const k = key(name, 'info')
  const cached = localStorage.getItem(k)
  if (cached) return JSON.parse(cached)

  const data = await fetchNamed(name)
  if (!data) return null

  const iu = data.image_uris ?? data.card_faces?.[0]?.image_uris
  const type_line = data.type_line ?? data.card_faces?.[0]?.type_line ?? ''
  if (!iu?.small || !iu?.normal) return null

  const info: CardInfo = { small: iu.small, normal: iu.normal, type_line }
  localStorage.setItem(k, JSON.stringify(info))
  return info
}

export async function getCardImages(name: string): Promise<ImgPair | null> {
  const info = await getCardInfo(name)
  return info ? { small: info.small, normal: info.normal } : null
}
