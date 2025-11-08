export type ImgPair = { small: string; normal: string }

function cacheKey(name: string) {
  return 'sf:' + name.toLowerCase().trim()
}

export async function getCardImages(name: string): Promise<ImgPair | null> {
  const key = cacheKey(name)
  const cached = localStorage.getItem(key)
  if (cached) return JSON.parse(cached)

  const fetchNamed = async (mode: 'exact' | 'fuzzy') => {
    const r = await fetch(`https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(name)}`)
    return r.ok ? r.json() : null
  }

  try {
    let data = await fetchNamed('exact')
    if (!data) data = await fetchNamed('fuzzy')
    if (!data) return null

    const img = data.image_uris ?? data.card_faces?.[0]?.image_uris
    if (!img?.small || !img?.normal) return null

    const pair: ImgPair = { small: img.small, normal: img.normal }
    localStorage.setItem(key, JSON.stringify(pair))
    return pair
  } catch {
    return null
  }
}
