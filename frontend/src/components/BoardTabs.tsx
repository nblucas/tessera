import { NavLink } from 'react-router'

export function BoardTabs() {
  return (
    <nav className="board-tabs">
      <NavLink to="/board/events">Events</NavLink>
      <NavLink to="/board/sellers">Sellers</NavLink>
      <NavLink to="/board/expenses">Expenses</NavLink>
      <NavLink to="/board/handover">Handover</NavLink>
    </nav>
  )
}
