import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, dateVN } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Loading, Notice } from '../ui.jsx';

export function ProductsPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState(null);
  const [meta, setMeta] = useState({ page: 1, last_page: 1 });
  const [filters, setFilters] = useState({ category: '', q: '', sort: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    params.set('page', meta.page);
    api(`/products?${params}`)
      .then((d) => {
        setProducts(d.data);
        setMeta({ page: d.current_page, last_page: d.last_page });
      })
      .catch((e) => setError(e.message));
  }, [filters, meta.page]);

  const update = (key) => (e) => {
    setFilters({ ...filters, [key]: e.target.value });
    setMeta({ ...meta, page: 1 });
  };

  return (
    <section>
      <div className="hero">
        <h1>Nông sản sạch, truy xuất được từng lô</h1>
        <p>Mỗi sản phẩm đều có mã QR dẫn tới nông trại, ngày thu hoạch và nhật ký canh tác.</p>
      </div>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get('code') || '').trim();
          if (code) navigate(`/trace/${encodeURIComponent(code)}`);
        }}
      >
        <input name="code" placeholder="Quét hoặc nhập mã truy xuất (ví dụ TR449C187C50)" />
        <button className="secondary">Truy xuất</button>
      </form>

      <div className="toolbar">
        <input placeholder="Tìm sản phẩm…" value={filters.q} onChange={update('q')} />
        <select value={filters.category} onChange={update('category')}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select value={filters.sort} onChange={update('sort')}>
          <option value="">Mới nhất</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
        </select>
      </div>

      <Notice kind="error">{error}</Notice>
      {!products && !error && <Loading />}
      {products && products.length === 0 && <Empty>Chưa có sản phẩm phù hợp.</Empty>}

      {products && products.length > 0 && (
        <div className="grid">
          {products.map((p) => (
            <Link key={p.id} to={`/products/${p.slug}`} className="card product">
              {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div className="placeholder">🥬</div>}
              <h3>{p.name}</h3>
              <p className="price">{money(p.price)} / {p.unit}</p>
              <p className="muted">{p.category?.name ?? 'Chưa phân loại'}</p>
              <Badge tone={p.sellable_stock > 0 ? 'green' : 'gray'}>
                {p.sellable_stock > 0 ? `Còn ${p.sellable_stock} ${p.unit}` : 'Hết hàng'}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {meta.last_page > 1 && (
        <div className="pager">
          <button className="secondary" disabled={meta.page <= 1} onClick={() => setMeta({ ...meta, page: meta.page - 1 })}>‹ Trước</button>
          <span>Trang {meta.page} / {meta.last_page}</span>
          <button className="secondary" disabled={meta.page >= meta.last_page} onClick={() => setMeta({ ...meta, page: meta.page + 1 })}>Sau ›</button>
        </div>
      )}
    </section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });

  useEffect(() => {
    api(`/products/${slug}`)
      .then(setProduct)
      .catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [slug]);

  async function addToCart() {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await api('/cart', { method: 'POST', body: { product_id: product.id, quantity: qty } });
      setMsg({ kind: 'success', text: 'Đã thêm vào giỏ hàng.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  if (!product) return msg.text ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Loading />;

  return (
    <section className="detail">
      <div>
        {product.image_url ? <img className="hero-img" src={product.image_url} alt={product.name} /> : <div className="placeholder big">🥬</div>}
      </div>
      <div>
        <h1>{product.name}</h1>
        <p className="price big">{money(product.price)} / {product.unit}</p>
        {product.description && <p>{product.description}</p>}
        <p>Còn bán: <strong>{product.sellable_stock} {product.unit}</strong></p>

        <div className="row">
          <input type="number" min="1" max="100" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <button disabled={!product.sellable_stock} onClick={addToCart}>Thêm vào giỏ</button>
        </div>
        <Notice kind={msg.kind}>{msg.text}</Notice>

        <h2>Lô hàng và nguồn gốc</h2>
        {product.batches.length === 0 ? (
          <Empty>Hiện chưa có lô hàng còn bán.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Lô</th><th>Nông trại</th><th>Thu hoạch</th><th>Hạn dùng</th><th>Còn</th><th>Truy xuất</th></tr>
            </thead>
            <tbody>
              {product.batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.batch_code}</td>
                  <td>{b.farm_plot?.name ?? '—'}</td>
                  <td>{dateVN(b.harvested_on)}</td>
                  <td>{dateVN(b.expires_on)}</td>
                  <td>{b.quantity_on_hand} {product.unit}</td>
                  <td><Link to={`/trace/${b.trace_code}`}>Xem QR</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function CartPage() {
  const [cart, setCart] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const navigate = useNavigate();

  const load = () =>
    api('/cart')
      .then(setCart)
      .catch((e) => setMsg({ kind: 'error', text: e.message }));

  useEffect(() => {
    load();
  }, []);

  async function changeQuantity(productId, quantity) {
    try {
      await api(`/cart/${productId}`, { method: 'PATCH', body: { quantity } });
      setMsg({ kind: '', text: '' });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  async function remove(productId) {
    await api(`/cart/${productId}`, { method: 'DELETE' });
    load();
  }

  if (!cart) return msg.text ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Loading />;
  if (cart.items.length === 0) {
    return <Empty>Giỏ hàng trống. <Link to="/">Tiếp tục mua sắm</Link></Empty>;
  }

  return (
    <section>
      <h1>Giỏ hàng</h1>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <table className="table">
        <thead>
          <tr><th>Sản phẩm</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th><th /></tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.product_id}>
              <td>{item.name}{!item.is_active && <Badge tone="red"> Ngừng bán</Badge>}</td>
              <td>{money(item.price)} / {item.unit}</td>
              <td>
                <input
                  type="number"
                  min="1"
                  max={item.available_stock || 1}
                  value={item.quantity}
                  onChange={(e) => changeQuantity(item.product_id, Number(e.target.value))}
                />
                <div className="muted small">Còn {item.available_stock} {item.unit}</div>
              </td>
              <td>{money(item.line_total)}</td>
              <td><button className="link" onClick={() => remove(item.product_id)}>Xóa</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="total">Tạm tính: <strong>{money(cart.subtotal)}</strong></p>
      <button onClick={() => navigate('/checkout')}>Tiến hành thanh toán</button>
    </section>
  );
}

export function CheckoutPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [form, setForm] = useState({
    shipping_name: user?.name ?? '',
    shipping_phone: user?.phone ?? '',
    shipping_address: user?.address ?? '',
    payment_method: 'cod',
    points_to_use: 0,
    distance_km: 5,
    note: '',
  });
  const [shippingFee, setShippingFee] = useState(0);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/cart').then(setCart).catch((e) => setMsg({ kind: 'error', text: e.message }));
    refresh().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cart) return;
    api(`/shipping/estimate?subtotal=${cart.subtotal}&distance_km=${form.distance_km}`)
      .then((d) => setShippingFee(d.shipping_fee))
      .catch(() => {});
  }, [cart, form.distance_km]);

  if (!cart) return <Loading />;
  if (cart.items.length === 0) return <Empty>Giỏ hàng trống. <Link to="/">Chọn sản phẩm</Link></Empty>;

  const maxPointsDiscount = Math.floor((cart.subtotal * 50) / 100);
  const pointsDiscount = Math.min(Number(form.points_to_use) * 1000, maxPointsDiscount);
  const estimatedTotal = cart.subtotal + shippingFee - pointsDiscount;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: '', text: '' });
    try {
      const res = await api('/checkout', {
        method: 'POST',
        body: {
          ...form,
          points_to_use: Number(form.points_to_use) || 0,
          distance_km: Number(form.distance_km) || 0,
        },
      });
      if (res.payment_url) {
        window.location.href = res.payment_url;
        return;
      }
      navigate(`/orders/${res.order.code}`);
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
      setBusy(false);
    }
  }

  return (
    <section className="two-col">
      <form className="card" onSubmit={submit}>
        <h2>Thông tin giao hàng</h2>
        <label>Họ tên<input required value={form.shipping_name} onChange={set('shipping_name')} /></label>
        <label>Số điện thoại<input required value={form.shipping_phone} onChange={set('shipping_phone')} placeholder="0901234567" /></label>
        <label>Địa chỉ<input required value={form.shipping_address} onChange={set('shipping_address')} /></label>
        <label>
          Khoảng cách ước tính (km)
          <input type="number" min="0" max="200" value={form.distance_km} onChange={set('distance_km')} />
        </label>
        <label>Ghi chú<textarea rows="2" value={form.note} onChange={set('note')} /></label>

        <h2>Thanh toán</h2>
        <label>
          Phương thức
          <select value={form.payment_method} onChange={set('payment_method')}>
            <option value="cod">Thanh toán khi nhận hàng</option>
            <option value="vnpay">VNPay</option>
          </select>
        </label>
        <label>
          Dùng điểm (có {user?.points_balance ?? 0} điểm, 1 điểm = 1.000 ₫)
          <input type="number" min="0" max={user?.points_balance ?? 0} value={form.points_to_use} onChange={set('points_to_use')} />
        </label>

        <Notice kind={msg.kind}>{msg.text}</Notice>
        <button disabled={busy}>{busy ? 'Đang xử lý…' : 'Đặt hàng'}</button>
      </form>

      <aside className="card summary">
        <h2>Tóm tắt đơn hàng</h2>
        {cart.items.map((i) => (
          <div className="line" key={i.product_id}><span>{i.name} × {i.quantity}</span><span>{money(i.line_total)}</span></div>
        ))}
        <div className="line"><span>Tạm tính</span><span>{money(cart.subtotal)}</span></div>
        <div className="line"><span>Phí giao hàng</span><span>{shippingFee === 0 ? 'Miễn phí' : money(shippingFee)}</span></div>
        <div className="line"><span>Giảm từ điểm</span><span>- {money(pointsDiscount)}</span></div>
        <div className="line total"><span>Tổng cộng (ước tính)</span><strong>{money(estimatedTotal)}</strong></div>
        <p className="muted small">Phí giao hàng được ước tính theo khoảng cách bạn nhập. Đơn từ 300.000 ₫ được miễn phí giao hàng.</p>
      </aside>
    </section>
  );
}

/** Simulated payment page used when VNPay credentials are not configured. */
export function MockPaymentPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api(`/payments/mock/${code}/complete`, { method: 'POST' });
      navigate(`/orders/${code}?payment=success`);
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h1>Cổng thanh toán giả lập</h1>
      <p>
        Đơn <strong>{code}</strong> sẽ được đánh dấu đã thanh toán khi bạn xác nhận. Đây là chế độ thử nghiệm
        (PAYMENT_MOCK_ENABLED). Khi có tài khoản VNPay, điền VNPAY_TMN_CODE và VNPAY_HASH_SECRET trong .env để dùng cổng thật.
      </p>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <div className="row">
        <button disabled={busy} onClick={confirm}>Xác nhận thanh toán</button>
        <button className="secondary" onClick={() => navigate(`/orders/${code}`)}>Thanh toán sau</button>
      </div>
    </section>
  );
}
