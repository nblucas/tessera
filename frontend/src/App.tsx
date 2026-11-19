import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { BoardProvider } from './board/BoardProvider'
import { BoardOnly } from './components/BoardOnly'
import { EventsProvider } from './events/EventsProvider'
import { ExpensesProvider } from './expenses/ExpensesProvider'
import { FEATURES } from './features'
import { BoardEventsPage } from './pages/board/BoardEventsPage'
import { BoardExpensesPage } from './pages/board/BoardExpensesPage'
import { BoardHandoverPage } from './pages/board/BoardHandoverPage'
import { BoardSellersPage } from './pages/board/BoardSellersPage'
import { EventFormPage } from './pages/board/EventFormPage'
import { ExpenseFormPage } from './pages/board/ExpenseFormPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { EventPage } from './pages/EventPage'
import { EventsPage } from './pages/EventsPage'
import { GatePage } from './pages/GatePage'
import { LoginPage } from './pages/LoginPage'
import { MySalesPage } from './pages/MySalesPage'
import { MyTicketsPage } from './pages/MyTicketsPage'
import { ResaleCheckoutPage } from './pages/ResaleCheckoutPage'
import { ResalePage } from './pages/ResalePage'
import { TransparencyPage } from './pages/TransparencyPage'
import { SellersProvider } from './sellers/SellersProvider'
import { TicketsProvider } from './tickets/TicketsProvider'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/transparency" element={<TransparencyPage />} />
      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="/" element={<EventsPage />} />
        <Route path="/events/:eventId" element={<EventPage />} />
        <Route path="/events/:eventId/checkout/:batchId" element={<CheckoutPage />} />
        <Route path="/tickets" element={<MyTicketsPage />} />
        {FEATURES.resale && (
          <>
            <Route path="/resale" element={<ResalePage />} />
            <Route path="/resale/:ticketId/checkout" element={<ResaleCheckoutPage />} />
          </>
        )}
        {FEATURES.sellers && <Route path="/sales" element={<MySalesPage />} />}
        {FEATURES.gate && (
          <Route
            path="/gate"
            element={
              <BoardOnly>
                <GatePage />
              </BoardOnly>
            }
          />
        )}
        <Route
          path="/board"
          element={
            <BoardOnly>
              <Outlet />
            </BoardOnly>
          }
        >
          <Route index element={<Navigate to="/board/events" replace />} />
          <Route path="events" element={<BoardEventsPage />} />
          <Route path="events/new" element={<EventFormPage />} />
          <Route path="events/:eventId" element={<EventFormPage />} />
          {FEATURES.sellers && <Route path="sellers" element={<BoardSellersPage />} />}
          <Route path="expenses" element={<BoardExpensesPage />} />
          <Route path="expenses/new" element={<ExpenseFormPage />} />
          <Route path="handover" element={<BoardHandoverPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BoardProvider>
        <EventsProvider>
          <SellersProvider>
            <TicketsProvider>
              <ExpensesProvider>
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </ExpensesProvider>
            </TicketsProvider>
          </SellersProvider>
        </EventsProvider>
      </BoardProvider>
    </AuthProvider>
  )
}

export default App
