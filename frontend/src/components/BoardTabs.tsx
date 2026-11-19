import { NavLink } from 'react-router'
import { FEATURES } from '../features'

export function BoardTabs() {
  return (
    <nav className="board-tabs">
      <NavLink to="/board/events">Events</NavLink>
      {FEATURES.sellers && <NavLink to="/board/sellers">Sellers</NavLink>}
      <NavLink to="/board/expenses">Expenses</NavLink>
      <NavLink to="/board/handover">Handover</NavLink>
    </nav>
  )
}
