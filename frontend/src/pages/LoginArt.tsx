const COLORS = ['#7c54c8', '#b8a5ee', '#ec8d50', '#f1c964', '#51b8aa', '#e377a6', '#343058']

const COLS = 6
const ROWS = 8
const SIZE = 100
const ANIMATION_SECONDS = 16

type Tile = {
  x: number
  y: number
  shape: number
  rotation: number
  delay: number
  bg: string
  fg: string
}

function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

function buildTiles(): Tile[] {
  const random = seededRandom(42)
  const pick = (n: number) => Math.floor(random() * n)
  const tiles: Tile[] = []

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const bg = COLORS[pick(COLORS.length)]
      let fg = COLORS[pick(COLORS.length)]
      if (fg === bg) {
        fg = COLORS[(COLORS.indexOf(bg) + 3) % COLORS.length]
      }
      tiles.push({
        x: col * SIZE,
        y: row * SIZE,
        shape: pick(5),
        rotation: pick(4) * 90,
        delay: random() * ANIMATION_SECONDS,
        bg,
        fg,
      })
    }
  }
  return tiles
}

const TILES = buildTiles()

function Shape({ shape, color }: { shape: number; color: string }) {
  switch (shape) {
    case 0: // quarter circle from a corner
      return <path d="M0 0 H100 A100 100 0 0 1 0 100 Z" fill={color} />
    case 1: // half circle on an edge
      return <path d="M0 100 A50 50 0 0 1 100 100 Z" fill={color} />
    case 2: // centered circle
      return <circle cx="50" cy="50" r="32" fill={color} />
    case 3: // diagonal triangle
      return <path d="M0 0 H100 L0 100 Z" fill={color} />
    default: // ring
      return <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="14" />
  }
}

export function LoginArt() {
  return (
    <div className="login-art">
      <svg
        viewBox={`0 0 ${COLS * SIZE} ${ROWS * SIZE}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {TILES.map((tile, index) => (
          <g
            key={index}
            transform={`translate(${tile.x} ${tile.y}) rotate(${tile.rotation} 50 50)`}
          >
            <rect width={SIZE} height={SIZE} fill={tile.bg} />
            <g
              className="tile-shape"
              style={{
                animationDuration: `${ANIMATION_SECONDS}s`,
                animationDelay: `-${tile.delay}s`,
              }}
            >
              <Shape shape={tile.shape} color={tile.fg} />
            </g>
          </g>
        ))}
      </svg>
    </div>
  )
}
