import { useEffect, useState } from 'react'
import { getCardImagesFor, type ImgPair } from '../lib/scryfall'

type Props = {
  name: string
  set_code?: string | null
  collector_number?: string | null
}

export default function CardThumb({ name, set_code, collector_number }: Props) {
  const [img, setImg] = useState<ImgPair | null>(null)

  useEffect(() => {
    let alive = true
    getCardImagesFor(name, set_code ?? undefined, collector_number ?? undefined)
      .then((v: ImgPair | null) => { if (alive) setImg(v) })
    return () => { alive = false }
  }, [name, set_code, collector_number])

  if (!img) {
    return (
      <div className="thumb">
        <div className="thumb-fallback">{name}</div>
      </div>
    )
  }

  return (
    <a className="thumb" href={img.normal} target="_blank" rel="noreferrer" title={name}>
      <img src={img.small} alt={name} />
    </a>
  )
}
