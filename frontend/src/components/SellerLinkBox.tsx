import { useState } from 'react'
import type { Seller } from '../data/sellers'

export function SellerLinkBox({ seller, eventId }: { seller: Seller; eventId: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/events/${eventId}?seller=${seller.id}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="seller-box">
      <p className="batch-name">Your sales link</p>
      <p className="muted">
        Share it to earn {seller.commissionPercent}% on every ticket sold through it.
      </p>
      <div className="pix-code">
        <code>{link}</code>
        <button type="button" className="secondary" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </section>
  )
}
