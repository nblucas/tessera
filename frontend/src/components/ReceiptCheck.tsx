import { useState, type ChangeEvent } from 'react'
import { receiptUrl } from '../api/client'
import type { AccountsExpense } from '../api/types'
import { sha256Hex } from '../lib/receipt'

type Result = { status: 'checking' } | { status: 'match' } | { status: 'mismatch'; hash: string }

// Lets anyone check a copy of a receipt against the SHA-256 recorded on the ledger.
export function ReceiptCheck({ expense }: { expense: AccountsExpense }) {
  const [result, setResult] = useState<Result | null>(null)
  const { receipt, receiptSha256 } = expense

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setResult({ status: 'checking' })
    try {
      const hash = await sha256Hex(await file.arrayBuffer())
      setResult(hash === receiptSha256 ? { status: 'match' } : { status: 'mismatch', hash })
    } catch {
      setResult(null)
    }
  }

  return (
    <div className="receipt-check">
      <div className="receipt-actions">
        {receipt && !receipt.erased ? (
          <a href={receiptUrl(receipt.id)} download={receipt.fileName}>
            Download receipt
          </a>
        ) : (
          <span className="ledger-sub">The file was erased for privacy; its hash stays on the ledger.</span>
        )}
        <label className="verify-label">
          Verify a copy
          <input type="file" className="visually-hidden" onChange={handleFile} />
        </label>
      </div>
      <p className="ledger-sub">
        Recorded SHA-256: <code className="hash">{receiptSha256}</code>
      </p>
      {result?.status === 'checking' && <p className="ledger-sub">Computing hash…</p>}
      {result?.status === 'match' && (
        <p className="verify-result positive">
          ✓ Matches the recorded hash. The receipt is unchanged.
        </p>
      )}
      {result?.status === 'mismatch' && (
        <p className="verify-result negative">
          ✗ Does not match. This file was modified or is a different receipt.
          <span className="ledger-sub">
            File SHA-256: <code className="hash">{result.hash}</code>
          </span>
        </p>
      )}
    </div>
  )
}
