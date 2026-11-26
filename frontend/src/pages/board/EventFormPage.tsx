import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { errorMessage } from '../../api/client'
import { useAuth } from '../../auth/context'
import type { Batch, Event } from '../../data/events'
import { useEvents, type BatchChange } from '../../events/context'
import { FEATURES } from '../../features'
import { centsToInput, parseReais } from '../../lib/format'

const COLORS = ['#7c54c8', '#ec8d50', '#51b8aa', '#f1c964', '#e377a6', '#343058']
const TIMEZONE = '-03:00'

// The date field shows São Paulo time (UTC−3).
function toDateInput(iso: string): string {
  const local = new Date(new Date(iso).getTime() - 3 * 60 * 60_000)
  return local.toISOString().slice(0, 16)
}

type BatchInput = Pick<Batch, 'id' | 'name' | 'priceCents' | 'quantity'>

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

// Waits for the events to load before building the form, so editing an event opened by URL
// (or after a reload) starts from its saved values.
export function EventFormPage() {
  const { eventId } = useParams()
  const { findEvent, loading } = useEvents()
  const existing = findEvent(eventId)
  const isNew = eventId === undefined

  if (!isNew && !existing && loading) return <AppHeader />

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

  return <EventForm key={existing?.id ?? 'new'} existing={existing} />
}

function EventForm({ existing }: { existing: Event | undefined }) {
  const navigate = useNavigate()
  const { sign } = useAuth()
  const { createEvent, updateEvent, changeBatches } = useEvents()
  const isNew = existing === undefined

  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [date, setDate] = useState(existing ? toDateInput(existing.date) : '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [resaleCap, setResaleCap] = useState(String(existing?.batches[0]?.resaleCapPercent ?? 120))
  const [batches, setBatches] = useState<BatchDraft[]>(
    existing ? existing.batches.map(toDraft) : [emptyBatch()],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function updateBatch(key: string, change: Partial<BatchDraft>) {
    setBatches((current) =>
      current.map((batch) => (batch.key === key ? { ...batch, ...change } : batch)),
    )
    setError(null)
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
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

    const parsed: BatchInput[] = []
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
      })
    }

    setSaving(true)
    setError(null)
    try {
      const details = {
        title: title.trim(),
        description: description.trim(),
        date: `${date}:00${TIMEZONE}`,
        location: location.trim(),
        color,
      }
      const event = existing
        ? await updateEvent(existing.id, details)
        : await createEvent(details)
      await saveBatches(event.id, parsed, cap)
      navigate('/board/events')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  // Each change to a batch's price or quantity is a ledger action the director signs.
  // Names are storefront data and need no signature. Every action is signed only after the
  // previous one was submitted, so each signature uses the next nonce.
  async function saveBatches(eventId: string, parsed: BatchInput[], resaleCapPercent: number) {
    const before = new Map((existing?.batches ?? []).map((batch) => [batch.id, batch]))
    const submit = async (change: () => Promise<BatchChange>) =>
      changeBatches(eventId, [await change()])

    for (const removed of before.values()) {
      if (!parsed.some((batch) => batch.id === removed.id)) {
        await submit(async () => ({
          batchId: removed.id,
          action: await sign('BatchRemoved', { eventId, batchId: removed.id }),
        }))
      }
    }
    for (const batch of parsed) {
      const old = before.get(batch.id)
      // The cap applies to every batch; a batch with sales is frozen, so it keeps its own.
      const capFor = old && old.sold > 0 ? old.resaleCapPercent : resaleCapPercent
      const fields = {
        eventId,
        batchId: batch.id,
        priceCents: batch.priceCents,
        quantity: batch.quantity,
        resaleCapPercent: capFor,
      }
      if (!old) {
        await submit(async () => ({
          batchId: batch.id,
          name: batch.name,
          action: await sign('BatchCreated', fields),
        }))
      } else if (
        old.priceCents !== batch.priceCents ||
        old.quantity !== batch.quantity ||
        old.resaleCapPercent !== capFor
      ) {
        await submit(async () => ({
          batchId: batch.id,
          name: batch.name,
          action: await sign('BatchUpdated', fields),
        }))
      } else if (old.name !== batch.name) {
        await submit(async () => ({ batchId: batch.id, name: batch.name }))
      }
    }
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
            {FEATURES.resale && (
              <div className="field">
                <label htmlFor="resale-cap">Resale cap (%)</label>
                <input
                  id="resale-cap"
                  inputMode="numeric"
                  value={resaleCap}
                  onChange={(e) => setResaleCap(e.target.value)}
                />
              </div>
            )}
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
          <p className="hint">
            A batch's price and quantity are frozen after its first sale. To sell more, add a new
            batch.
          </p>
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
                  disabled={batch.sold > 0}
                  title={batch.sold > 0 ? 'Frozen after the first sale' : undefined}
                  inputMode="decimal"
                  value={batch.price}
                  onChange={(e) => updateBatch(batch.key, { price: e.target.value })}
                />
                <input
                  placeholder="Quantity"
                  disabled={batch.sold > 0}
                  title={batch.sold > 0 ? 'Frozen after the first sale' : undefined}
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
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
