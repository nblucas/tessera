import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type PixCharge = { txid: string; amountCents: number; expiresAt: Date }

// natureza ORIGINAL: a refund we asked for. MED_FRAUDE / MED_OPERACIONAL: the bank returned the
// money to the payer through the Mecanismo Especial de Devolução (a reversal).
export type Devolucao = {
  id: string
  status: 'EM_PROCESSAMENTO' | 'DEVOLVIDO' | 'NAO_REALIZADO'
  natureza: 'ORIGINAL' | 'MED_FRAUDE' | 'MED_OPERACIONAL'
  amountCents: number
}

export type PixNotification = {
  txid: string
  e2eid: string
  amountCents: number
  paidAt: string
  devolucoes: Devolucao[]
}

export type Webhook = { headers: Record<string, string>; payload: string }

// Shaped after the Central Bank's API Pix (bacen/pix-api): a charge with a txid, the payment's
// end-to-end id (e2eid), refunds requested with PUT /pix/{e2eid}/devolucao/{id}, and the same
// webhook reporting payments and devoluções that reached a final status. Check against the
// chosen PSP before the pilot.
export interface PixProvider {
  createCharge(charge: PixCharge): Promise<{ copyPaste: string }>
  // Idempotent per (e2eid, refundId), like the API Pix.
  refund(e2eid: string, refundId: string, amountCents: number): Promise<void>
  // Sends a reseller their share. A real PSP would pay a Pix key; the demo pays an account id.
  payout(recipient: string, amountCents: number, reference: string): Promise<void>
  // Returns the notification if the webhook is authentic, or null.
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): PixNotification | null
  // Demo only: build the webhook the provider would send.
  simulatePayment?(txid: string, amountCents: number): Webhook
  simulateReversal?(txid: string, amountCents: number): Webhook
}

const SIGNATURE_HEADER = 'x-pix-signature'

// Demo: no bank involved. Webhooks are signed with HMAC-SHA256 over the raw body, standing in
// for the real provider's signature or mTLS.
export class FakePixProvider implements PixProvider {
  readonly refunds: { e2eid: string; refundId: string; amountCents: number }[] = []
  readonly payouts: { recipient: string; amountCents: number; reference: string }[] = []
  private readonly secret: string
  // The same charge always settles with the same e2eid, so a resent webhook is a true duplicate.
  private readonly e2eids = new Map<string, string>()

  constructor(secret: string) {
    this.secret = secret
  }

  async createCharge({ txid, amountCents }: PixCharge) {
    const amount = (amountCents / 100).toFixed(2)
    const copyPaste = `00020126580014br.gov.bcb.pix0136tessera-${txid}5204000053039865406${amount}5802BR5907TESSERA6009SAO PAULO6304A1B2`
    return { copyPaste }
  }

  async refund(e2eid: string, refundId: string, amountCents: number) {
    if (this.refunds.some((item) => item.e2eid === e2eid && item.refundId === refundId)) return
    this.refunds.push({ e2eid, refundId, amountCents })
  }

  async payout(recipient: string, amountCents: number, reference: string) {
    if (this.payouts.some((item) => item.reference === reference)) return
    this.payouts.push({ recipient, amountCents, reference })
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const received = headers[SIGNATURE_HEADER]
    if (typeof received !== 'string') return null
    const expected = this.sign(rawBody)
    if (received.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null
    try {
      const { pix } = JSON.parse(rawBody) as {
        pix: {
          endToEndId: string
          txid: string
          valor: string
          horario: string
          devolucoes?: { id: string; status: Devolucao['status']; natureza: Devolucao['natureza']; valor: string }[]
        }[]
      }
      const [payment] = pix
      return {
        txid: payment.txid,
        e2eid: payment.endToEndId,
        amountCents: toCents(payment.valor),
        paidAt: payment.horario,
        devolucoes: (payment.devolucoes ?? []).map((item) => ({
          id: item.id,
          status: item.status,
          natureza: item.natureza,
          amountCents: toCents(item.valor),
        })),
      }
    } catch {
      return null
    }
  }

  simulatePayment(txid: string, amountCents: number): Webhook {
    return this.webhook({
      endToEndId: this.e2eidFor(txid),
      txid,
      valor: toReais(amountCents),
      horario: new Date().toISOString(),
    })
  }

  // The payer's bank returned the money through MED (for example a fraud claim).
  simulateReversal(txid: string, amountCents: number): Webhook {
    return this.webhook({
      endToEndId: this.e2eidFor(txid),
      txid,
      valor: toReais(amountCents),
      horario: new Date().toISOString(),
      devolucoes: [
        {
          id: `MED${randomBytes(8).toString('hex')}`,
          rtrId: `D${randomBytes(15).toString('hex')}`,
          valor: toReais(amountCents),
          natureza: 'MED_FRAUDE',
          status: 'DEVOLVIDO',
        },
      ],
    })
  }

  private e2eidFor(txid: string): string {
    let e2eid = this.e2eids.get(txid)
    if (!e2eid) {
      // E + ISPB (8) + date/time (12) + 11 random characters: 32 characters, like a real e2eid.
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12)
      e2eid = `E00000000${stamp}${randomBytes(6).toString('hex').slice(0, 11)}`
      this.e2eids.set(txid, e2eid)
    }
    return e2eid
  }

  private webhook(pix: Record<string, unknown>): Webhook {
    const payload = JSON.stringify({ pix: [pix] })
    return {
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: this.sign(payload) },
      payload,
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('hex')
  }
}

function toCents(valor: string): number {
  return Math.round(Number(valor) * 100)
}

function toReais(cents: number): string {
  return (cents / 100).toFixed(2)
}
