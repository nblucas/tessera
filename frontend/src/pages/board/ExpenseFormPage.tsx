import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@tessera/shared'
import { errorMessage } from '../../api/client'
import { useEvents } from '../../events/context'
import { useExpenses } from '../../expenses/context'
import { parseReais } from '../../lib/format'
import { MAX_RECEIPT_BYTES, sha256Hex } from '../../lib/receipt'

export function ExpenseFormPage() {
  const { events } = useEvents()
  const { proposeExpense } = useExpenses()
  const navigate = useNavigate()

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0])
  const [eventId, setEventId] = useState('')
  const [receipt, setReceipt] = useState<{ file: File; sha256: string } | null>(null)
  const [reading, setReading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setReceipt(null)
    setError(null)
    if (!file) return
    if (file.size > MAX_RECEIPT_BYTES) {
      setError('The receipt must be at most 1 MB.')
      event.target.value = ''
      return
    }
    setReading(true)
    try {
      setReceipt({ file, sha256: await sha256Hex(await file.arrayBuffer()) })
    } catch {
      setError('Could not read this file. Try another one.')
    } finally {
      setReading(false)
    }
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const amountCents = parseReais(amount)

    if (!description.trim()) {
      setError('Description is required.')
      return
    }
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount, e.g. 1.250,00.')
      return
    }
    if (!receipt) {
      setError('Attach the receipt (invoice or Pix voucher).')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await proposeExpense({
        description: description.trim(),
        amountCents,
        category,
        eventId: eventId || undefined,
        file: receipt.file,
        sha256: receipt.sha256,
      })
      navigate('/board/expenses')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AppHeader />
      <main className="page board-form">
        <Link to="/board/expenses" className="back-link">
          ← Board expenses
        </Link>
        <h1>New expense</h1>
        <p className="muted">
          Submitting counts as your approval. It becomes final once a majority of the board
          approves.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input
              id="description"
              placeholder="e.g. Sound system rental"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="amount">Amount (R$)</label>
              <input
                id="amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="event">Event</label>
            <select id="event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">General (not tied to an event)</option>
              {sortedEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receipt">Receipt</label>
            <input
              id="receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFile}
            />
            {reading && <p className="hint receipt-hint">Computing hash…</p>}
            {receipt && (
              <p className="hint receipt-hint">
                SHA-256: <code className="hash">{receipt.sha256}</code>
              </p>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <Link to="/board/expenses" className="button-link secondary-link">
              Cancel
            </Link>
            <button type="submit" disabled={reading || submitting}>
              {submitting ? 'Submitting…' : 'Submit expense'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
