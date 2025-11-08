export type ImgPair = { small: string; normal: string }
export type CardInfo = ImgPair & { type_line: string }

function k(parts: (string | undefined)[], tag = 'info') {
  return `sf:${tag}:${parts.map(s => (s ?? '').toLowerCase().trim()).join('|')}`
}

async function fetchNamed(name: string) {
  const exact = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
  if (exact.ok) return exact.json()
  const fuzzy = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
  return fuzzy.ok ? fuzzy.json() : null
}

async function normalize(data: any): Promise<CardInfo | null> {
  const iu = data?.image_uris ?? data?.card_faces?.[0]?.image_uris
  const type_line = data?.type_line ?? data?.card_faces?.[0]?.type_line ?? ''
  if (!iu?.small || !iu?.normal) return null
  return { small: iu.small, normal: iu.normal, type_line }
}

/** printing-specific: /cards/{set}/{number} (e.g., ltr/224) */
export async function getCardInfoPrinting(set_code: string, collector_number: string): Promise<CardInfo | null> {
  const key = k([set_code, collector_number], 'print')
  const cached = localStorage.getItem(key)
  if (cached) return JSON.parse(cached)
  const r = await fetch(`https://api.scryfall.com/cards/${set_code.toLowerCase()}/${encodeURIComponent(collector_number)}`)
  if (!r.ok) return null
  const info = await normalize(await r.json())
  if (info) localStorage.setItem(key, JSON.stringify(info))
  return info
}

export async function getCardInfo(name: string): Promise<CardInfo | null> {
  const key = k([name], 'info')
  const cached = localStorage.getItem(key)
  if (cached) return JSON.parse(cached)
  const data = await fetchNamed(name)
  const info = await normalize(data)
  if (info) localStorage.setItem(key, JSON.stringify(info))
  return info
}

export async function getCardInfoFor(
  name: string,
  set_code?: string,
  collector_number?: string
): Promise<CardInfo | null> {
  if (set_code && collector_number) return getCardInfoPrinting(set_code, collector_number)
  return getCardInfo(name)
}

export async function getCardImagesFor(
  name: string,
  set_code?: string,
  collector_number?: string
): Promise<ImgPair | null> {
  const info = await getCardInfoFor(name, set_code, collector_number)
  return info ? { small: info.small, normal: info.normal } : null
}
