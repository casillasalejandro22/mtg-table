import { useEffect, useState } from 'react'
import { getCardImages, type ImgPair } from '../lib/scryfall'

export default function CardThumb({ name }: { name: string }) {
  const [img, setImg] = useState<ImgPair | null>(null)

  useEffect(() => {
    let alive = true
    getCardImages(name).then(v => { if (alive) setImg(v) })
    return () => { alive = false }
  }, [name])

  if (!img) return <div className="thumb">
    <div className="thumb-fallback">{name}</div>
  </div>

  return (
    <a className="thumb" href={img.normal} target="_blank" rel="noreferrer" title={name}>
      <img src={img.small} alt={name} />
    </a>
  )
}
