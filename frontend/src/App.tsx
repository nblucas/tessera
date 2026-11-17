import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { BoardOnly } from './components/BoardOnly'
import { EventsProvider } from './events/EventsProvider'
import { BoardEventsPage } from './pages/board/BoardEventsPage'
import { BoardSellersPage } from './pages/board/BoardSellersPage'
import { EventFormPage } from './pages/board/EventFormPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { EventPage } from './pages/EventPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'
import { MySalesPage } from './pages/MySalesPage'
import { MyTicketsPage } from './pages/MyTicketsPage'
import { ResaleCheckoutPage } from './pages/ResaleCheckoutPage'
import { ResalePage } from './pages/ResalePage'
import { SellersProvider } from './sellers/SellersProvider'
import { TicketsProvider } from './tickets/TicketsProvider'

function App() {
  return (
    <AuthProvider>
      <EventsProvider>
        <SellersProvider>
          <TicketsProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
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
                  <Route path="/resale" element={<ResalePage />} />
                  <Route path="/resale/:ticketId/checkout" element={<ResaleCheckoutPage />} />
                  <Route path="/sales" element={<MySalesPage />} />
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
                    <Route path="sellers" element={<BoardSellersPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </TicketsProvider>
        </SellersProvider>
      </EventsProvider>
    </AuthProvider>
  )
}

export default App
