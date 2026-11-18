import { useState, type ChangeEvent } from 'react'
import type { Receipt } from '../data/expenses'
import { sha256Hex } from '../lib/receipt'

type Result = { status: 'checking' } | { status: 'match' } | { status: 'mismatch'; hash: string }

export function ReceiptCheck({ receipt }: { receipt: Receipt }) {
  const [result, setResult] = useState<Result | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setResult({ status: 'checking' })
    try {
      const hash = await sha256Hex(await file.arrayBuffer())
      setResult(hash === receipt.sha256 ? { status: 'match' } : { status: 'mismatch', hash })
    } catch {
      setResult(null)
    }
  }

  return (
    <div className="receipt-check">
      <div className="receipt-actions">
        <a href={receipt.dataUrl} download={receipt.fileName}>
          Download receipt
        </a>
        <label className="verify-label">
          Verify a copy
          <input type="file" className="visually-hidden" onChange={handleFile} />
        </label>
      </div>
      <p className="ledger-sub">
        Recorded SHA-256: <code className="hash">{receipt.sha256}</code>
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
