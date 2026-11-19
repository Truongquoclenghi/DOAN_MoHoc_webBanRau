import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { CartPage, CheckoutPage, MockPaymentPage, ProductPage, ProductsPage } from './pages/Shop.jsx';
import { ComplaintsPage, OrderPage, OrdersPage, PointsPage, SubscriptionsPage } from './pages/Account.jsx';
import { LoginPage, RegisterPage } from './pages/Auth.jsx';
import { TracePage } from './pages/Trace.jsx';
import { AdminPage } from './pages/Admin.jsx';

function RequireAuth({ children, admin = false }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="muted">Đang tải…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="topbar">
      <Link to="/" className="brand">🌿 Nông trại xanh</Link>
      <nav>
        <NavLink to="/">Sản phẩm</NavLink>
        {user && (
          <>
            <NavLink to="/cart">Giỏ hàng</NavLink>
            <NavLink to="/orders">Đơn hàng</NavLink>
            <NavLink to="/subscriptions">Gói đăng ký</NavLink>
            <NavLink to="/points">Điểm</NavLink>
            <NavLink to="/complaints">Khiếu nại</NavLink>
            {user.role === 'admin' && <NavLink to="/admin">Quản trị</NavLink>}
          </>
        )}
      </nav>
      <div className="account">
        {user ? (
          <>
            <span>{user.name}</span>
            <button className="link" onClick={handleLogout}>Đăng xuất</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Đăng nhập</NavLink>
            <NavLink to="/register">Đăng ký</NavLink>
          </>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <main className="container">
          <Routes>
            <Route path="/" element={<ProductsPage />} />
            <Route path="/products/:slug" element={<ProductPage />} />
            <Route path="/trace/:code" element={<TracePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/cart" element={<RequireAuth><CartPage /></RequireAuth>} />
            <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/payment/mock/:code" element={<RequireAuth><MockPaymentPage /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="/orders/:code" element={<RequireAuth><OrderPage /></RequireAuth>} />
            <Route path="/points" element={<RequireAuth><PointsPage /></RequireAuth>} />
            <Route path="/subscriptions" element={<RequireAuth><SubscriptionsPage /></RequireAuth>} />
            <Route path="/complaints" element={<RequireAuth><ComplaintsPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
            <Route path="*" element={<p>Không tìm thấy trang.</p>} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  );
}
