import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import type { Batch, Event } from '../../data/events'
import { useEvents } from '../../events/context'
import { centsToInput, parseReais } from '../../lib/format'

const COLORS = ['#7c54c8', '#ec8d50', '#51b8aa', '#f1c964', '#e377a6', '#343058']
const TIMEZONE_SUFFIX = ':00-03:00'

type BatchDraft = {
  key: string
  id?: string
  name: string
  price: string
  quantity: string
  sold: number
}

function toDraft(batch: Batch): BatchDraft {
  return {
    key: batch.id,
    id: batch.id,
    name: batch.name,
    price: centsToInput(batch.priceCents),
    quantity: String(batch.quantity),
    sold: batch.sold,
  }
}

function emptyBatch(): BatchDraft {
  return { key: crypto.randomUUID(), name: '', price: '', quantity: '', sold: 0 }
}

function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'event'}-${crypto.randomUUID().slice(0, 4)}`
}

export function EventFormPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { findEvent, saveEvent } = useEvents()
  const existing = findEvent(eventId)
  const isNew = eventId === undefined

  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [date, setDate] = useState(existing?.date.slice(0, 16) ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [resaleCap, setResaleCap] = useState(String(existing?.resaleCapPercent ?? 120))
  const [batches, setBatches] = useState<BatchDraft[]>(
    existing ? existing.batches.map(toDraft) : [emptyBatch()],
  )
  const [error, setError] = useState<string | null>(null)

  if (!isNew && !existing) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <Link to="/board/events" className="back-link">
            ← Board events
          </Link>
          <h1>Event not found</h1>
        </main>
      </>
    )
  }

  function updateBatch(key: string, change: Partial<BatchDraft>) {
    setBatches((current) =>
      current.map((batch) => (batch.key === key ? { ...batch, ...change } : batch)),
    )
    setError(null)
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()

    if (!title.trim() || !date || !location.trim()) {
      setError('Title, date and location are required.')
      return
    }
    const cap = Number(resaleCap)
    if (!Number.isInteger(cap) || cap < 100) {
      setError('The resale cap must be a whole number of at least 100%.')
      return
    }
    if (batches.length === 0) {
      setError('Add at least one batch.')
      return
    }

    const parsed: Batch[] = []
    for (const [index, draft] of batches.entries()) {
      const priceCents = parseReais(draft.price)
      const quantity = Number(draft.quantity)
      if (!draft.name.trim()) {
        setError(`Batch ${index + 1}: name is required.`)
        return
      }
      if (priceCents === null || priceCents <= 0) {
        setError(`Batch ${index + 1}: enter a valid price, e.g. 40,00.`)
        return
      }
      if (!Number.isInteger(quantity) || quantity < Math.max(1, draft.sold)) {
        setError(
          `Batch ${index + 1}: quantity must be a whole number of at least ${Math.max(1, draft.sold)}.`,
        )
        return
      }
      parsed.push({
        id: draft.id ?? `b${crypto.randomUUID().slice(0, 6)}`,
        name: draft.name.trim(),
        priceCents,
        quantity,
        sold: draft.sold,
      })
    }

    const event: Event = {
      id: existing?.id ?? slugify(title),
      title: title.trim(),
      description: description.trim(),
      date: `${date}${TIMEZONE_SUFFIX}`,
      location: location.trim(),
      color,
      resaleCapPercent: cap,
      batches: parsed,
    }
    saveEvent(event)
    navigate('/board/events')
  }

  return (
    <>
      <AppHeader />
      <main className="page board-form">
        <Link to="/board/events" className="back-link">
          ← Board events
        </Link>
        <h1>{isNew ? 'New event' : 'Edit event'}</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="date">Date and time</label>
              <input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="resale-cap">Resale cap (%)</label>
              <input
                id="resale-cap"
                inputMode="numeric"
                value={resaleCap}
                onChange={(e) => setResaleCap(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="location">Location</label>
            <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div className="field">
            <label>Color</label>
            <div className="color-picker">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`color-swatch${option === color ? ' selected' : ''}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  title={option}
                />
              ))}
            </div>
          </div>

          <h2 className="section-title">Batches</h2>
          <div className="batch-editor">
            {batches.map((batch) => (
              <div key={batch.key} className="batch-editor-row">
                <input
                  placeholder="Name (e.g. 1st batch)"
                  value={batch.name}
                  onChange={(e) => updateBatch(batch.key, { name: e.target.value })}
                />
                <input
                  placeholder="Price (R$)"
                  inputMode="decimal"
                  value={batch.price}
                  onChange={(e) => updateBatch(batch.key, { price: e.target.value })}
                />
                <input
                  placeholder="Quantity"
                  inputMode="numeric"
                  value={batch.quantity}
                  onChange={(e) => updateBatch(batch.key, { quantity: e.target.value })}
                />
                {batch.sold > 0 ? (
                  <span className="hint batch-sold">{batch.sold} sold</span>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setBatches((current) => current.filter((item) => item.key !== batch.key))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary add-batch"
            onClick={() => setBatches((current) => [...current, emptyBatch()])}
          >
            + Add batch
          </button>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <Link to="/board/events" className="button-link secondary-link">
              Cancel
            </Link>
            <button type="submit">{isNew ? 'Create event' : 'Save changes'}</button>
          </div>
        </form>
      </main>
    </>
  )
}
