import { useEffect, useState } from 'react';
import { api, dateVN, money, formData, FARM_TYPES, ORDER_STATUS, COMPLAINT_STATUS, PAYMENT_LABEL } from '../api.js';
import { Empty, Loading, Notice, Stat, StatusBadge } from '../ui.jsx';

const TABS = [
  ['dashboard', 'Tổng quan'],
  ['products', 'Sản phẩm & lô hàng'],
  ['farm', 'Nông trại & nhật ký'],
  ['orders', 'Đơn hàng'],
  ['complaints', 'Khiếu nại'],
  ['plans', 'Gói đăng ký'],
  ['users', 'Người dùng'],
];

export function AdminPage() {
  const [tab, setTab] = useState('dashboard');

  return (
    <section>
      <h1>Quản trị</h1>
      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? '' : 'secondary'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'farm' && <FarmTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'complaints' && <ComplaintsTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'users' && <UsersTab />}
    </section>
  );
}

/* ---------- Dashboard: KPIs, revenue, expiry alerts ---------- */

function DashboardTab() {
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = () => {
    api('/admin/dashboard').then(setSummary);
    api('/admin/reports/revenue?months=6').then(setRevenue);
    api('/admin/expiry-alerts').then(setAlerts);
  };

  useEffect(() => {
    load();
  }, []);

  async function expireDue() {
    try {
      const res = await api('/admin/batches/expire-due', { method: 'POST' });
      setMsg({ kind: 'success', text: `Đã đánh dấu ${res.expired_batches} lô hết hạn.` });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  if (!summary || !revenue || !alerts) return <Loading />;

  const maxRevenue = Math.max(1, ...revenue.months.map((m) => m.revenue));

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <div className="stats">
        <Stat label="Doanh thu hôm nay" value={money(summary.revenue_today)} />
        <Stat label="Doanh thu tháng này" value={money(summary.revenue_month)} />
        <Stat label="Khiếu nại đang mở" value={summary.open_complaints} />
        <Stat label="Lô sắp hết hạn" value={summary.expiring_batches} />
        <Stat label="Giá trị sắp hết hạn" value={money(summary.expiring_value_vnd)} />
        <Stat label="Lô hết hạn chưa xử lý" value={summary.expired_batches_unhandled} />
      </div>

      <h2>Doanh thu 6 tháng gần nhất</h2>
      <div className="bars">
        {revenue.months.map((m) => (
          <div key={m.month} className="bar-col">
            <span className="small">{money(m.revenue)}</span>
            <div className="bar" style={{ height: `${(m.revenue / maxRevenue) * 100}%` }} />
            <span className="small">{m.month}</span>
          </div>
        ))}
      </div>

      <h2>Sản phẩm bán chạy</h2>
      {revenue.top_products.length === 0 ? (
        <Empty>Chưa có đơn đã thanh toán.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Doanh thu</th></tr></thead>
          <tbody>
            {revenue.top_products.map((p) => (
              <tr key={p.name}><td>{p.name}</td><td>{p.quantity}</td><td>{money(p.revenue)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row space">
        <h2>Cảnh báo hạn sử dụng (trong {alerts.alert_days} ngày)</h2>
        <button className="secondary" onClick={expireDue}>Đánh dấu lô đã hết hạn</button>
      </div>
      {alerts.expiring.length === 0 ? (
        <Empty>Không có lô nào sắp hết hạn.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Sản phẩm</th><th>Lô</th><th>Nông trại</th><th>Hết hạn</th><th>Còn</th></tr></thead>
          <tbody>
            {alerts.expiring.map((b) => (
              <tr key={b.id}>
                <td>{b.product?.name}</td><td>{b.batch_code}</td><td>{b.farm_plot?.name ?? '—'}</td>
                <td>{dateVN(b.expires_on)}</td><td>{b.quantity_on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {alerts.expired.length > 0 && (
        <>
          <h2>Lô đã hết hạn, cần xuất hủy</h2>
          <table className="table">
            <thead><tr><th>Sản phẩm</th><th>Hết hạn</th><th>Còn</th></tr></thead>
            <tbody>
              {alerts.expired.map((b) => (
                <tr key={b.id}><td>{b.product?.name}</td><td>{dateVN(b.expires_on)}</td><td>{b.quantity_on_hand}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/* ---------- Products, categories, batches (FEFO, waste) ---------- */

function ProductsTab() {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [plots, setPlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [batches, setBatches] = useState([]);
  const [fefoQty, setFefoQty] = useState(1);
  const [fefo, setFefo] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const loadProducts = () => api('/admin/products').then((d) => setProducts(d.data));
  const loadCategories = () => api('/admin/categories').then(setCategories);
  const loadBatches = (product) => api(`/admin/products/${product.id}/batches`).then(setBatches);

  useEffect(() => {
    loadProducts();
    loadCategories();
    api('/admin/farm-plots').then(setPlots);
  }, []);

  useEffect(() => {
    setFefo(null);
    if (selected) loadBatches(selected);
  }, [selected]);

  async function run(action, okText) {
    try {
      await action();
      setMsg({ kind: 'success', text: okText });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  async function createProduct(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    await run(async () => {
      await api('/admin/products', { method: 'POST', form: formData(formEl) });
      formEl.reset();
      loadProducts();
    }, 'Đã thêm sản phẩm.');
  }

  async function createCategory(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    await run(async () => {
      await api('/admin/categories', { method: 'POST', body: { name: new FormData(formEl).get('name') } });
      formEl.reset();
      loadCategories();
    }, 'Đã thêm danh mục.');
  }

  async function deactivate(product) {
    await run(async () => {
      await api(`/admin/products/${product.id}`, { method: 'DELETE' });
      loadProducts();
    }, 'Đã ngừng bán sản phẩm.');
  }

  async function receiveBatch(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    await run(async () => {
      await api(`/admin/products/${selected.id}/batches`, {
        method: 'POST',
        body: {
          farm_plot_id: fd.get('farm_plot_id') || null,
          quantity_received: Number(fd.get('quantity_received')),
          harvested_on: fd.get('harvested_on'),
          expires_on: fd.get('expires_on'),
        },
      });
      formEl.reset();
      loadBatches(selected);
      loadProducts();
    }, 'Đã nhập lô hàng mới (có mã QR truy xuất).');
  }

  async function previewFefo() {
    try {
      setFefo(await api(`/admin/products/${selected.id}/fefo-preview?quantity=${fefoQty}`));
      setMsg({ kind: '', text: '' });
    } catch (e) {
      setFefo(null);
      setMsg({ kind: 'error', text: e.message });
    }
  }

  if (!products) return <Loading />;

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>

      <div className="two-col">
        <form className="card" onSubmit={createProduct}>
          <h2>Thêm sản phẩm</h2>
          <label>Tên sản phẩm<input name="name" required /></label>
          <label>
            Danh mục
            <select name="category_id">
              <option value="">— Chưa phân loại —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label>Đơn vị<input name="unit" defaultValue="kg" required /></label>
            <label>Giá (VND)<input name="price" type="number" min="0" required /></label>
          </div>
          <label>Mô tả<textarea name="description" rows="2" /></label>
          <label>Ảnh sản phẩm<input type="file" name="image" accept="image/*" /></label>
          <button>Thêm sản phẩm</button>
        </form>

        <form className="card" onSubmit={createCategory}>
          <h2>Danh mục</h2>
          <div className="row">
            <input name="name" placeholder="Tên danh mục, ví dụ: Rau củ" required />
            <button>Thêm</button>
          </div>
          <p className="muted small">{categories.map((c) => c.name).join(' · ') || 'Chưa có danh mục.'}</p>
        </form>
      </div>

      <h2>Sản phẩm</h2>
      <table className="table">
        <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn (lô còn bán)</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className={selected?.id === p.id ? 'active-row' : ''}>
              <td>{p.name}</td>
              <td>{p.category?.name ?? '—'}</td>
              <td>{money(p.price)} / {p.unit}</td>
              <td>{p.stock ?? 0} {p.unit}</td>
              <td>{p.is_active ? 'Đang bán' : 'Ngừng bán'}</td>
              <td>
                <button className="link" onClick={() => setSelected(p)}>Lô hàng</button>
                {p.is_active && <button className="link danger-text" onClick={() => deactivate(p)}>Ngừng bán</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="card">
          <h2>Lô hàng: {selected.name}</h2>
          {batches.length === 0 ? (
            <Empty>Chưa có lô nào.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Lô</th><th>Mã QR</th><th>Nông trại</th><th>Thu hoạch</th><th>Hết hạn</th><th>Còn</th><th>Trạng thái</th><th>Xuất hủy</th></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.batch_code}</td>
                    <td><a href={`/trace/${b.trace_code}`} target="_blank" rel="noreferrer">{b.trace_code}</a></td>
                    <td>{b.farm_plot?.name ?? '—'}</td>
                    <td>{dateVN(b.harvested_on)}</td>
                    <td>{dateVN(b.expires_on)}</td>
                    <td>{b.quantity_on_hand}</td>
                    <td>{b.status}</td>
                    <td><WasteForm batch={b} onDone={() => { loadBatches(selected); loadProducts(); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="two-col">
            <form className="card" onSubmit={receiveBatch}>
              <h3>Nhập lô mới</h3>
              <label>
                Nông trại
                <select name="farm_plot_id">
                  <option value="">— Không gắn lô đất —</option>
                  {plots.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </label>
              <label>Số lượng<input name="quantity_received" type="number" min="1" required /></label>
              <div className="row">
                <label>Ngày thu hoạch<input name="harvested_on" type="date" required /></label>
                <label>Hạn sử dụng<input name="expires_on" type="date" required /></label>
              </div>
              <button>Nhập lô</button>
            </form>

            <div className="card">
              <h3>Xem trước xuất kho theo FEFO</h3>
              <p className="muted small">Hệ thống luôn lấy lô sắp hết hạn trước.</p>
              <div className="row">
                <input type="number" min="1" value={fefoQty} onChange={(e) => setFefoQty(e.target.value)} />
                <button className="secondary" onClick={previewFefo}>Xem</button>
              </div>
              {fefo && (
                <table className="table">
                  <thead><tr><th>Lô</th><th>Hết hạn</th><th>Lấy</th></tr></thead>
                  <tbody>
                    {fefo.plan.map((l) => (
                      <tr key={l.batch_id}><td>{l.batch_code}</td><td>{dateVN(l.expires_on)}</td><td>{l.quantity}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WasteForm({ batch, onDone }) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api(`/admin/batches/${batch.id}/waste`, { method: 'POST', body: { quantity: Number(quantity), reason } });
      setQuantity('');
      setReason('');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  if (batch.quantity_on_hand === 0) return <span className="muted small">—</span>;

  return (
    <form className="waste" onSubmit={submit}>
      <input type="number" min="1" max={batch.quantity_on_hand} placeholder="SL" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      <input placeholder="Lý do (dập, nát, héo…)" value={reason} onChange={(e) => setReason(e.target.value)} required />
      <button className="secondary">Ghi nhận</button>
      {error && <span className="red-text small">{error}</span>}
    </form>
  );
}

/* ---------- Farm plots and cultivation diary ---------- */

function FarmTab() {
  const [plots, setPlots] = useState([]);
  const [products, setProducts] = useState([]);
  const [logs, setLogs] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const loadPlots = () => api('/admin/farm-plots').then(setPlots);
  const loadLogs = () => api('/admin/farm-logs').then((d) => setLogs(d.data));

  useEffect(() => {
    loadPlots();
    loadLogs();
    api('/admin/products').then((d) => setProducts(d.data));
  }, []);

  async function createPlot(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    try {
      await api('/admin/farm-plots', { method: 'POST', body: Object.fromEntries(new FormData(formEl)) });
      formEl.reset();
      loadPlots();
      setMsg({ kind: 'success', text: 'Đã thêm lô canh tác.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function createLog(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    try {
      await api('/admin/farm-logs', { method: 'POST', form: formData(formEl) });
      formEl.reset();
      loadLogs();
      setMsg({ kind: 'success', text: 'Đã ghi nhật ký canh tác. Nhật ký sẽ hiện trên trang truy xuất QR.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function removeLog(id) {
    if (!window.confirm('Xóa nhật ký này?')) return;
    await api(`/admin/farm-logs/${id}`, { method: 'DELETE' });
    loadLogs();
  }

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <div className="two-col">
        <form className="card" onSubmit={createPlot}>
          <h2>Lô canh tác</h2>
          <div className="row">
            <label>Mã lô<input name="code" required placeholder="LD-01" /></label>
            <label>Tên<input name="name" required /></label>
          </div>
          <label>Địa chỉ<input name="location" /></label>
          <div className="row">
            <label>Diện tích (m²)<input name="area_m2" type="number" step="0.01" min="0" /></label>
            <label>Chứng nhận<input name="certification" placeholder="VietGAP, hữu cơ…" /></label>
          </div>
          <label>Mô tả<textarea name="description" rows="2" /></label>
          <button>Thêm lô canh tác</button>
          <ul className="small">{plots.map((p) => <li key={p.id}>{p.code} · {p.name} ({p.logs_count} nhật ký)</li>)}</ul>
        </form>

        <form className="card" onSubmit={createLog}>
          <h2>Ghi nhật ký canh tác</h2>
          <label>
            Lô canh tác
            <select name="farm_plot_id" required>
              <option value="">— Chọn lô —</option>
              {plots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label>
              Loại
              <select name="type" required>
                {Object.entries(FARM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              Ngày
              <input name="logged_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
          <label>
            Sản phẩm liên quan (nếu có)
            <select name="product_id">
              <option value="">— Không —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Mô tả<textarea name="description" rows="3" required /></label>
          <label>Ảnh hoặc video<input type="file" name="media" accept="image/*,video/mp4" /></label>
          <button>Ghi nhật ký</button>
        </form>
      </div>

      <h2>Nhật ký gần đây</h2>
      {!logs && <Loading />}
      {logs && logs.length === 0 && <Empty>Chưa có nhật ký.</Empty>}
      {logs && logs.length > 0 && (
        <table className="table">
          <thead><tr><th>Ngày</th><th>Lô</th><th>Loại</th><th>Nội dung</th><th>Media</th><th /></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{dateVN(l.logged_on)}</td>
                <td>{l.farm_plot?.name}</td>
                <td>{FARM_TYPES[l.type]}</td>
                <td>{l.description}</td>
                <td>{l.media_url ? <a href={l.media_url} target="_blank" rel="noreferrer">{l.media_type}</a> : '—'}</td>
                <td><button className="link danger-text" onClick={() => removeLog(l.id)}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- Orders ---------- */

function OrdersTab() {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = () => {
    const q = status ? `?status=${status}` : '';
    api(`/admin/orders${q}`).then((d) => setOrders(d.data));
  };

  useEffect(() => {
    load();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function move(order, next) {
    try {
      await api(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status: next } });
      setMsg({ kind: 'success', text: `Đơn ${order.code}: ${ORDER_STATUS[next]}.` });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  const NEXT = {
    pending: [['paid', 'Đã thanh toán'], ['cancelled', 'Hủy']],
    paid: [['shipping', 'Giao hàng'], ['cancelled', 'Hủy']],
    shipping: [['delivered', 'Đã giao']],
  };

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <div className="row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!orders && <Loading />}
      {orders && orders.length === 0 && <Empty>Không có đơn nào.</Empty>}
      {orders && orders.length > 0 && (
        <table className="table">
          <thead><tr><th>Mã đơn</th><th>Khách</th><th>Giao đến</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.code}</td>
                <td>{o.user?.name}<div className="muted small">{o.user?.phone}</div></td>
                <td className="small">{o.shipping_address}</td>
                <td>{money(o.total)}</td>
                <td>{PAYMENT_LABEL[o.payment_method]} · {o.payment_status}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>
                  {(NEXT[o.status] ?? []).map(([next, label]) => (
                    <button key={next} className={next === 'cancelled' ? 'link danger-text' : 'link'} onClick={() => move(o, next)}>{label}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- Complaints ---------- */

function ComplaintsTab() {
  const [items, setItems] = useState(null);

  const load = () => api('/admin/complaints').then((d) => setItems(d.data));
  useEffect(() => {
    load();
  }, []);

  if (!items) return <Loading />;
  if (items.length === 0) return <Empty>Chưa có khiếu nại nào.</Empty>;

  return (
    <div>
      {items.map((c) => <ComplaintRow key={c.id} complaint={c} onSaved={load} />)}
    </div>
  );
}

function ComplaintRow({ complaint, onSaved }) {
  const [status, setStatus] = useState(complaint.status);
  const [reply, setReply] = useState(complaint.admin_reply ?? '');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  async function save() {
    try {
      await api(`/admin/complaints/${complaint.id}`, { method: 'PATCH', body: { status, admin_reply: reply } });
      setMsg({ kind: 'success', text: 'Đã lưu.' });
      onSaved();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  return (
    <div className="card">
      <strong>{complaint.subject}</strong>
      <span className="muted small"> · {complaint.user?.name} · {complaint.order ? `Đơn ${complaint.order.code}` : 'Không gắn đơn'}</span>
      <p>{complaint.content}</p>
      {complaint.image_url && <img className="log-media" src={complaint.image_url} alt="" />}
      <div className="row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={save}>Lưu</button>
      </div>
      <textarea rows="2" placeholder="Phản hồi cho khách" value={reply} onChange={(e) => setReply(e.target.value)} />
      <Notice kind={msg.kind}>{msg.text}</Notice>
    </div>
  );
}

/* ---------- Subscription plans ---------- */

function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = () => api('/admin/subscription-plans').then(setPlans);

  useEffect(() => {
    load();
    api('/admin/products').then((d) => setProducts(d.data));
  }, []);

  async function createPlan(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const items = Object.entries(quantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([productId, q]) => ({ product_id: Number(productId), quantity: Number(q) }));

    if (items.length === 0) {
      setMsg({ kind: 'error', text: 'Chọn ít nhất một sản phẩm cho gói.' });
      return;
    }

    try {
      await api('/admin/subscription-plans', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          description: fd.get('description') || null,
          discount_percent: Number(fd.get('discount_percent') || 0),
          items,
        },
      });
      formEl.reset();
      setQuantities({});
      setMsg({ kind: 'success', text: 'Đã tạo gói đăng ký.' });
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function removePlan(plan) {
    try {
      const res = await api(`/admin/subscription-plans/${plan.id}`, { method: 'DELETE' });
      setMsg({ kind: 'success', text: res.message });
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <form className="card" onSubmit={createPlan}>
        <h2>Tạo gói hàng tháng</h2>
        <div className="row">
          <label>Tên gói<input name="name" required /></label>
          <label>Giảm giá (%)<input name="discount_percent" type="number" min="0" max="100" defaultValue="10" /></label>
        </div>
        <label>Mô tả<input name="description" /></label>
        <h3>Sản phẩm trong gói (số lượng mỗi tuần, 0 = không chọn)</h3>
        <table className="table">
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{money(p.price)} / {p.unit}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    className="narrow-input"
                    value={quantities[p.id] ?? 0}
                    onChange={(e) => setQuantities({ ...quantities, [p.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button>Tạo gói</button>
      </form>

      <h2>Các gói hiện có</h2>
      {plans.length === 0 && <Empty>Chưa có gói nào.</Empty>}
      {plans.map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong> {p.is_active ? <span className="badge green">Đang mở</span> : <span className="badge gray">Tạm ngừng</span>}
          <span className="muted small"> · giảm {p.discount_percent}%</span>
          <ul>{p.items.map((i) => <li key={i.id}>{i.product?.name} × {i.quantity}</li>)}</ul>
          <button className="link danger-text" onClick={() => removePlan(p)}>Xóa / ngừng mở bán</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Users ---------- */

function UsersTab() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = () => api(`/admin/users?q=${encodeURIComponent(q)}`).then((d) => setUsers(d.data));

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(user, body) {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body });
      setMsg({ kind: 'success', text: 'Đã cập nhật tài khoản.' });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  return (
    <div>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Tìm theo tên hoặc email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary">Tìm</button>
      </form>
      {!users && <Loading />}
      {users && (
        <table className="table">
          <thead><tr><th>Tên</th><th>Email</th><th>Điểm</th><th>Vai trò</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.points_balance}</td>
                <td>
                  <select value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                    <option value="customer">Khách hàng</option>
                    <option value="admin">Quản trị</option>
                  </select>
                </td>
                <td>
                  <button className="link" onClick={() => update(u, { is_active: !u.is_active })}>
                    {u.is_active ? 'Khóa tài khoản' : 'Mở khóa'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
