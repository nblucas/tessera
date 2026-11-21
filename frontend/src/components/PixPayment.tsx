import { useEffect, useState } from 'react'
import { FakeQrCode } from './FakeQrCode'

const CONFIRMATION_DELAY_MS = 2000

// Builds a placeholder Pix code. Used only where no backend charge exists yet (resale roadmap).
function pixCode(reference: string, amountCents: number): string {
  const amount = (amountCents / 100).toFixed(2)
  return `00020126580014br.gov.bcb.pix0136tessera-${reference}5204000053039865406${amount}5802BR5907TESSERA6009SAO PAULO6304A1B2`
}

type PixPaymentProps = {
  amountCents: number
  reference: string
  // The charge's "copy and paste" code from the backend.
  code?: string
  // Demo mode: show the "Simulate payment" button.
  canSimulate?: boolean
  onPaid: () => void | Promise<void>
}

export function PixPayment({
  amountCents,
  reference,
  code: chargeCode,
  canSimulate = true,
  onPaid,
}: PixPaymentProps) {
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const code = chargeCode ?? pixCode(reference, amountCents)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => {
      Promise.resolve(onPaid()).finally(() => setConfirming(false))
    }, CONFIRMATION_DELAY_MS)
    return () => clearTimeout(timer)
  }, [confirming, onPaid])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="checkout-panel">
      <h2>Pay with Pix</h2>
      <p className="muted">Scan the QR code with your bank app, or copy the Pix code.</p>
      <div className="qr-wrapper">
        <FakeQrCode value={code} size={220} />
      </div>
      <div className="pix-code">
        <code>{code}</code>
        <button type="button" className="secondary" onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {canSimulate ? (
        <>
          <button
            type="button"
            className="checkout-confirm"
            onClick={() => setConfirming(true)}
            disabled={confirming}
          >
            {confirming ? 'Confirming payment…' : 'Simulate payment'}
          </button>
          <p className="hint">Demo mode: no real payment is made.</p>
        </>
      ) : (
        <p className="hint">Waiting for your payment…</p>
      )}
    </section>
  )
}
