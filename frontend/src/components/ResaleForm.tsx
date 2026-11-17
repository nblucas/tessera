import { useState, type FormEvent } from 'react'
import { formatPrice } from '../lib/format'
import { PLATFORM_FEE_PERCENT, ROYALTY_PERCENT, resaleSplit } from '../lib/resale'

type ResaleFormProps = {
  faceValueCents: number
  maxPriceCents: number
  capPercent: number
  onSubmit: (priceCents: number) => void
  onCancel: () => void
}

function parseReais(text: string): number | null {
  const trimmed = text.trim()
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

export function ResaleForm({
  faceValueCents,
  maxPriceCents,
  capPercent,
  onSubmit,
  onCancel,
}: ResaleFormProps) {
  const [text, setText] = useState((faceValueCents / 100).toFixed(2).replace('.', ','))
  const [error, setError] = useState<string | null>(null)

  const priceCents = parseReais(text)
  const split = priceCents !== null && priceCents > 0 ? resaleSplit(priceCents) : null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (priceCents === null || priceCents <= 0) {
      setError('Enter a valid price, e.g. 45,00.')
      return
    }
    if (priceCents > maxPriceCents) {
      setError(`The maximum price for this ticket is ${formatPrice(maxPriceCents)}.`)
      return
    }
    onSubmit(priceCents)
  }

  return (
    <form className="resale-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="resale-price">Resale price (R$)</label>
      <input
        id="resale-price"
        inputMode="decimal"
        className={error ? 'invalid' : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        autoFocus
      />
      <p className="hint resale-cap">
        Max {formatPrice(maxPriceCents)} ({capPercent}% of the {formatPrice(faceValueCents)} face
        value)
      </p>
      {error && <p className="error">{error}</p>}

      {split && (
        <dl className="resale-split">
          <dt>Association ({ROYALTY_PERCENT}%)</dt>
          <dd>{formatPrice(split.association)}</dd>
          <dt>Platform fee ({PLATFORM_FEE_PERCENT}%)</dt>
          <dd>{formatPrice(split.platform)}</dd>
          <dt>You receive via Pix</dt>
          <dd>
            <strong>{formatPrice(split.reseller)}</strong>
          </dd>
        </dl>
      )}

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">List for sale</button>
      </div>
    </form>
  )
}
