import { useState, type FormEvent } from 'react'
import { centsToInput, formatPrice, parseReais } from '../lib/format'
import { PLATFORM_FEE_PERCENT, ROYALTY_PERCENT, resaleSplit } from '../lib/resale'

type ResaleFormProps = {
  faceValueCents: number
  maxPriceCents: number
  capPercent: number
  onSubmit: (priceCents: number) => void | Promise<void>
  onCancel: () => void
}

export function ResaleForm({
  faceValueCents,
  maxPriceCents,
  capPercent,
  onSubmit,
  onCancel,
}: ResaleFormProps) {
  const [text, setText] = useState(centsToInput(faceValueCents))
  const [error, setError] = useState<string | null>(null)

  const priceCents = parseReais(text)
  const split = priceCents !== null && priceCents > 0 ? resaleSplit(priceCents) : null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (priceCents === null || priceCents <= 0) {
      setError('Enter a valid price, e.g. 45,00.')
      return
    }
    // The cap is not checked here on purpose: the ledger enforces it, and its refusal is shown.
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
      <p className={`hint resale-cap${priceCents !== null && priceCents > maxPriceCents ? ' error' : ''}`}>
        Max {formatPrice(maxPriceCents)} ({capPercent}% of the {formatPrice(faceValueCents)} face
        value). The ledger refuses anything higher.
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
