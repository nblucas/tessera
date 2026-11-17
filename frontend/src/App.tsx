import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { CheckoutPage } from './pages/CheckoutPage'
import { EventPage } from './pages/EventPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'
import { MySalesPage } from './pages/MySalesPage'
import { MyTicketsPage } from './pages/MyTicketsPage'
import { ResaleCheckoutPage } from './pages/ResaleCheckoutPage'
import { ResalePage } from './pages/ResalePage'
import { TicketsProvider } from './tickets/TicketsProvider'

function App() {
  return (
    <AuthProvider>
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
              <Route path="/sales" element={<MySalesPage />} />
              <Route path="/resale/:ticketId/checkout" element={<ResaleCheckoutPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TicketsProvider>
    </AuthProvider>
  )
}

export default App
