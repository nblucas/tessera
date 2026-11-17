const GRID = 25
const FINDER = 7

function hash(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function isInFinder(x: number, y: number): boolean {
  const start = (n: number) => n <= FINDER
  const end = (n: number) => n >= GRID - FINDER - 1
  return (start(x) && start(y)) || (end(x) && start(y)) || (start(x) && end(y))
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" fill="#000" />
      <rect x="1" y="1" width="5" height="5" fill="#fff" />
      <rect x="2" y="2" width="3" height="3" fill="#000" />
    </g>
  )
}

function buildCells(value: string): { x: number; y: number }[] {
  let state = hash(value) || 1
  const random = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }

  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const filled = random() < 0.5
      if (filled && !isInFinder(x, y)) {
        cells.push({ x, y })
      }
    }
  }
  return cells
}

export function FakeQrCode({ value, size = 200 }: { value: string; size?: number }) {
  const cells = buildCells(value)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-2 -2 ${GRID + 4} ${GRID + 4}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      className="qr-code"
    >
      <rect x="-2" y="-2" width={GRID + 4} height={GRID + 4} fill="#fff" />
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#000" />
      ))}
      <Finder x={0} y={0} />
      <Finder x={GRID - FINDER} y={0} />
      <Finder x={0} y={GRID - FINDER} />
    </svg>
  )
}
