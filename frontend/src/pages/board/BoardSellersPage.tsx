import { useState, type FormEvent } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import type { Seller } from '../../data/sellers'
import { formatPrice } from '../../lib/format'
import { useSellers } from '../../sellers/context'
import { useTickets } from '../../tickets/context'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parsePercent(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function SellerRow({ seller }: { seller: Seller }) {
  const { saveSeller, removeSeller } = useSellers()
  const { tickets } = useTickets()
  const [percent, setPercent] = useState(String(seller.commissionPercent))

  const sales = tickets.filter((ticket) => ticket.sellerId === seller.id)
  const commission = sales.reduce((sum, ticket) => sum + (ticket.commissionCents ?? 0), 0)
  const parsed = parsePercent(percent)
  const changed = parsed !== null && parsed !== seller.commissionPercent

  return (
    <li className="batch-row">
      <div>
        <p className="batch-name">{seller.name}</p>
        <p className="muted">
          {seller.email} · {sales.length} sales · {formatPrice(commission)} commission
        </p>
      </div>
      <div className="batch-action">
        <div className="percent-input">
          <input
            inputMode="decimal"
            className={parsed === null ? 'invalid' : undefined}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
          <span>%</span>
        </div>
        {changed && (
          <button
            type="button"
            onClick={() => saveSeller({ ...seller, commissionPercent: parsed })}
          >
            Save
          </button>
        )}
        <button type="button" className="secondary" onClick={() => removeSeller(seller.id)}>
          Remove
        </button>
      </div>
    </li>
  )
}

function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'seller'}-${crypto.randomUUID().slice(0, 4)}`
}

function AddSellerForm() {
  const { sellers, saveSeller } = useSellers()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [percent, setPercent] = useState('10')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const commissionPercent = parsePercent(percent)

    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid e-mail address.')
      return
    }
    if (sellers.some((seller) => seller.email === normalizedEmail)) {
      setError('This e-mail is already registered as a seller.')
      return
    }
    if (commissionPercent === null) {
      setError('Commission must be between 0 and 100%.')
      return
    }

    saveSeller({
      id: slugify(name),
      name: name.trim(),
      email: normalizedEmail,
      commissionPercent,
    })
    setName('')
    setEmail('')
    setPercent('10')
    setError(null)
  }

  return (
    <form className="add-seller" onSubmit={handleSubmit} noValidate>
      <div className="add-seller-fields">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <input
          placeholder="E-mail"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
        />
        <div className="percent-input">
          <input
            inputMode="decimal"
            value={percent}
            onChange={(e) => {
              setPercent(e.target.value)
              setError(null)
            }}
          />
          <span>%</span>
        </div>
        <button type="submit">Add seller</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export function BoardSellersPage() {
  const { sellers } = useSellers()

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Board · Sellers</h1>
        <p className="muted">
          Students who sell tickets through their own link and earn a commission on each sale.
        </p>
        <BoardTabs />

        {sellers.length === 0 ? (
          <div className="empty-state">
            <p>No sellers registered yet.</p>
          </div>
        ) : (
          <ul className="batch-list board-list">
            {sellers.map((seller) => (
              <SellerRow key={seller.id} seller={seller} />
            ))}
          </ul>
        )}

        <h2 className="section-title">Add seller</h2>
        <AddSellerForm />
      </main>
    </>
  )
}
