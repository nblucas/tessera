import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/context'
import { useBoard } from '../../board/context'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import type { BoardMember, BoardTerm } from '../../data/board'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

type MemberDraft = BoardMember & { key: string }

function emptyMember(): MemberDraft {
  return { key: crypto.randomUUID(), name: '', email: '' }
}

function MemberList({ members }: { members: BoardMember[] }) {
  return (
    <ul className="member-list">
      {members.map((member) => (
        <li key={member.email}>
          <span className="batch-name">{member.name}</span>
          <span className="muted">{member.email}</span>
        </li>
      ))}
    </ul>
  )
}

function TermCard({ term, current = false }: { term: BoardTerm; current?: boolean }) {
  return (
    <section className={`term-card${current ? ' term-current' : ''}`}>
      <div className="term-heading">
        <p className="batch-name">Term {term.number}</p>
        <p className="muted">
          {dateFormatter.format(new Date(term.startedAt))} –{' '}
          {term.endedAt ? dateFormatter.format(new Date(term.endedAt)) : 'present'}
        </p>
      </div>
      <MemberList members={term.members} />
    </section>
  )
}

function ProposeForm() {
  const { user } = useAuth()
  const { proposeHandover } = useBoard()
  const [drafts, setDrafts] = useState<MemberDraft[]>(() => [
    emptyMember(),
    emptyMember(),
    emptyMember(),
  ])
  const [error, setError] = useState<string | null>(null)

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
    if (!user) return
    proposeHandover(user.email, members)
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
        <button type="submit">Propose handover</button>
      </div>
    </form>
  )
}

function PendingHandover() {
  const { user } = useAuth()
  const { handover, majority, memberName, approveHandover, cancelHandover } = useBoard()
  if (!handover || !user) return null

  const approved = handover.approvals.includes(user.email)
  const isProposer = handover.proposedBy === user.email

  return (
    <section className="term-card term-pending">
      <div className="term-heading">
        <p className="batch-name">Proposed new board</p>
        <span className="badge expense-pending">
          {handover.approvals.length}/{majority} approvals
        </span>
      </div>
      <MemberList members={handover.newMembers} />
      <p className="hint expense-meta">
        Proposed by {memberName(handover.proposedBy)} · Approved by{' '}
        {handover.approvals.map(memberName).join(', ')}
      </p>
      <p className="hint expense-meta">
        Once approved, the new board takes over and the current directors lose all roles. The
        full history stays with the association.
      </p>
      <div className="expense-actions">
        {isProposer && (
          <button type="button" className="secondary" onClick={() => cancelHandover(user.email)}>
            Cancel proposal
          </button>
        )}
        {!approved && (
          <button type="button" onClick={() => approveHandover(user.email)}>
            Approve handover
          </button>
        )}
      </div>
    </section>
  )
}

export function BoardHandoverPage() {
  const { current, past, handover, majority, members } = useBoard()

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Board · Handover</h1>
        <p className="muted">
          At the end of a term, propose the next board. It takes over once {majority} of the{' '}
          {members.length} current directors approve.
        </p>
        <BoardTabs />

        <h2 className="section-title">Current board</h2>
        <TermCard term={current} current />

        <h2 className="section-title">Next board</h2>
        {handover ? <PendingHandover /> : <ProposeForm />}

        {past.length > 0 && (
          <>
            <h2 className="section-title">Past terms</h2>
            <div className="term-list">
              {past.map((term) => (
                <TermCard key={term.number} term={term} />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}
