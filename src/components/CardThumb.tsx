import { useEffect, useState } from 'react'
import { getCardImagesFor, type ImgPair } from '../lib/scryfall'

type Props = {
  name: string
  /** Scryfall set code, optional */
  set?: string
  /** Collector number (string in Scryfall), optional */
  number?: string
  /** visual size */
  size?: 'sm' | 'md' | 'lg'
  /** optional className pass-through */
  className?: string
}

export default function CardThumb({
  name,
  set,
  number,
  size = 'md',
  className,
}: Props) {
  const [imgs, setImgs] = useState<ImgPair | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await getCardImagesFor(name, set, number)
      if (!cancelled) setImgs(data)
    })()
    return () => {
      cancelled = true
    }
  }, [name, set, number])

  const src =
    size === 'sm' ? imgs?.small ?? imgs?.normal : imgs?.normal ?? imgs?.small

  // fallback rectangle if we have nothing yet
  if (!src) {
    const h = size === 'sm' ? 180 : 310
    const w = Math.round(h * 0.72)
    return (
      <div
        className={className}
        style={{
          width: w,
          height: h,
          borderRadius: 8,
          background: 'linear-gradient(180deg,#1b1b1b,#0f0f0f)',
          border: '1px solid var(--border)',
        }}
        title={name}
      />
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={name}
      title={name}
      style={{
        display: 'block',
        borderRadius: 12,
        border: '1px solid var(--border)',
        width: size === 'sm' ? 180 : 310,
        height: 'auto',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  )
}
