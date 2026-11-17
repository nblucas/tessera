export function TesseraMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="22" height="22" rx="5" fill="#7c54c8" />
      <rect x="26" y="0" width="22" height="22" rx="5" fill="#ec8d50" />
      <rect x="0" y="26" width="22" height="22" rx="5" fill="#51b8aa" />
      <rect x="26" y="26" width="22" height="22" rx="5" fill="#f1c964" />
      <path d="M26 0 H43 A5 5 0 0 1 48 5 V22 A22 22 0 0 1 26 0 Z" fill="#e377a6" />
      <circle cx="11" cy="37" r="6" fill="#343058" />
    </svg>
  )
}
