import { createHmac, timingSafeEqual } from 'node:crypto'

export type PixCharge = { txid: string; amountCents: number; expiresAt: Date }
export type PixPayment = { txid: string; amountCents: number; paidAt: string }
export type Webhook = { headers: Record<string, string>; payload: string }

// Shaped after the Central Bank's API Pix (charge with a txid, webhook on payment, refund).
// Check against the chosen PSP before the pilot.
export interface PixProvider {
  createCharge(charge: PixCharge): Promise<{ copyPaste: string }>
  refund(txid: string, amountCents: number): Promise<void>
  // Returns the payment if the webhook is authentic, or null.
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): PixPayment | null
  // Demo only: builds the webhook the provider would send when the payer pays.
  simulatePayment?(txid: string, amountCents: number): Webhook
}

const SIGNATURE_HEADER = 'x-pix-signature'

// Demo: no bank involved. Webhooks are signed with HMAC-SHA256 over the raw body, standing in
// for the real provider's signature or mTLS.
export class FakePixProvider implements PixProvider {
  readonly refunds: { txid: string; amountCents: number }[] = []
  private readonly secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  async createCharge({ txid, amountCents }: PixCharge) {
    const amount = (amountCents / 100).toFixed(2)
    const copyPaste = `00020126580014br.gov.bcb.pix0136tessera-${txid}5204000053039865406${amount}5802BR5907TESSERA6009SAO PAULO6304A1B2`
    return { copyPaste }
  }

  async refund(txid: string, amountCents: number) {
    this.refunds.push({ txid, amountCents })
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const received = headers[SIGNATURE_HEADER]
    if (typeof received !== 'string') return null
    const expected = this.sign(rawBody)
    if (received.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null
    try {
      const { pix } = JSON.parse(rawBody) as { pix: { txid: string; valor: string; horario: string }[] }
      const [payment] = pix
      return {
        txid: payment.txid,
        amountCents: Math.round(Number(payment.valor) * 100),
        paidAt: payment.horario,
      }
    } catch {
      return null
    }
  }

  simulatePayment(txid: string, amountCents: number): Webhook {
    const payload = JSON.stringify({
      pix: [{ txid, valor: (amountCents / 100).toFixed(2), horario: new Date().toISOString() }],
    })
    return {
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: this.sign(payload) },
      payload,
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('hex')
  }
}
