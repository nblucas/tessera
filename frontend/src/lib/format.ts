const priceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatPrice(cents: number): string {
  return priceFormatter.format(cents / 100)
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}
