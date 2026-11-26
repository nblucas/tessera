import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../api/client'
import type { HandoverView, TermView } from '../../api/types'
import { useAuth } from '../../auth/context'
import { useBoard } from '../../board/context'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import { OracleSection } from '../../components/OracleSection'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

type MemberDraft = { name: string; email: string; key: string }

function emptyMember(): MemberDraft {
  return { key: crypto.randomUUID(), name: '', email: '' }
}

function MemberList({ members }: { members: { name: string | null; detail: string }[] }) {
  return (
    <ul className="member-list">
      {members.map((member) => (
        <li key={member.detail}>
          <span className="batch-name">{member.name ?? 'Former member'}</span>
          <span className="muted">{member.detail}</span>
        </li>
      ))}
    </ul>
  )
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function TermCard({ term, current = false }: { term: TermView; current?: boolean }) {
  return (
    <section className={`term-card${current ? ' term-current' : ''}`}>
      <div className="term-heading">
        <p className="batch-name">Term {term.term}</p>
        <p className="muted">
          {dateFormatter.format(new Date(term.startedAt))} –{' '}
          {term.endedAt ? dateFormatter.format(new Date(term.endedAt)) : 'present'}
        </p>
      </div>
      <MemberList
        members={term.members.map((member) => ({ name: member.name, detail: shortAddress(member.address) }))}
      />
    </section>
  )
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function ProposeForm() {
  const { proposeHandover } = useBoard()
  const [drafts, setDrafts] = useState<MemberDraft[]>(() => [
    emptyMember(),
    emptyMember(),
    emptyMember(),
  ])
  const { busy, error, setError, run } = useAction()

  function updateDraft(key: string, change: Partial<MemberDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)),
    )
    setError(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const members = drafts.map((draft) => ({
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
    }))

    if (members.length === 0) {
      setError('Add at least one director.')
      return
    }
    for (const [index, member] of members.entries()) {
      if (!member.name) {
        setError(`Director ${index + 1}: name is required.`)
        return
      }
      if (!EMAIL_PATTERN.test(member.email)) {
        setError(`Director ${index + 1}: enter a valid e-mail.`)
        return
      }
    }
    if (new Set(members.map((member) => member.email)).size !== members.length) {
      setError('Each director must have a different e-mail.')
      return
    }
    run(() => proposeHandover(members))
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="batch-editor">
        {drafts.map((draft) => (
          <div key={draft.key} className="member-editor-row">
            <input
              placeholder="Name"
              value={draft.name}
              onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
            />
            <input
              placeholder="E-mail"
              type="email"
              value={draft.email}
              onChange={(e) => updateDraft(draft.key, { email: e.target.value })}
            />
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setDrafts((current) => current.filter((item) => item.key !== draft.key))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary add-batch"
        onClick={() => setDrafts((current) => [...current, emptyMember()])}
      >
        + Add director
      </button>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>
          Propose handover
        </button>
      </div>
    </form>
  )
}

function PendingHandover({ handover }: { handover: HandoverView }) {
  const { user } = useAuth()
  const { board, submitProposal, approveHandover, cancelHandover } = useBoard()
  const { busy, error, run } = useAction()

  const isProposer =
    !!user?.address && handover.proposedBy.address?.toLowerCase() === user.address.toLowerCase()
  const approved = handover.approvals.some(
    (person) => person.address.toLowerCase() === user?.address?.toLowerCase(),
  )
  const ready = handover.missing.length === 0

  return (
    <section className="term-card term-pending">
      <div className="term-heading">
        <p className="batch-name">Proposed new board</p>
        <span className="badge expense-pending">
          {handover.status === 'draft'
            ? ready
              ? 'Ready to propose'
              : 'Waiting for sign-ins'
            : `${handover.approvals.length}/${board?.majority ?? 0} approvals`}
        </span>
      </div>
      <MemberList
        members={handover.members.map((member) => ({
          name: member.name,
          detail: member.address ? member.email : `${member.email} · has not signed in yet`,
        }))}
      />
      <p className="hint expense-meta">
        Proposed by {handover.proposedBy.name ?? 'a director'}
        {handover.status === 'open' &&
          ` · Approved by ${handover.approvals.map((person) => person.name ?? person.address).join(', ')}`}
      </p>
      {handover.status === 'draft' && !ready && (
        <p className="hint expense-meta">
          Each new director signs in once to create their wallet. Waiting for{' '}
          {handover.missing.join(', ')}.
        </p>
      )}
      <p className="hint expense-meta">
        Once approved, the new board takes over and the current directors lose all roles. The
        full history stays with the association.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="expense-actions">
        {isProposer && (
          <button type="button" className="secondary" disabled={busy} onClick={() => run(cancelHandover)}>
            Cancel proposal
          </button>
        )}
        {handover.status === 'draft' && isProposer && (
          <button type="button" disabled={busy || !ready} onClick={() => run(submitProposal)}>
            Submit proposal
          </button>
        )}
        {handover.status === 'open' && !approved && (
          <button type="button" disabled={busy} onClick={() => run(approveHandover)}>
            Approve handover
          </button>
        )}
      </div>
    </section>
  )
}

export function BoardHandoverPage() {
  const { board, loading } = useBoard()

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Board · Handover</h1>
        <p className="muted">
          At the end of a term, propose the next board. It takes over once {board?.majority ?? 0} of
          the {board?.current.members.length ?? 0} current directors approve.
        </p>
        <BoardTabs />

        {loading || !board ? (
          <p className="muted">Loading the board…</p>
        ) : (
          <>
            <h2 className="section-title">Current board</h2>
            <TermCard term={board.current} current />

            <h2 className="section-title">Next board</h2>
            {board.handover ? <PendingHandover handover={board.handover} /> : <ProposeForm />}

            <h2 className="section-title">Payment oracle</h2>
            <OracleSection />

            {board.past.length > 0 && (
              <>
                <h2 className="section-title">Past terms</h2>
                <div className="term-list">
                  {board.past.map((term) => (
                    <TermCard key={term.term} term={term} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}
