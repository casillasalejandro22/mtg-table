import { useEffect } from 'react'

export default function Lightbox({
  src, alt, onClose,
}: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt ?? ''} />
        <button className="btn mini lightbox-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}
