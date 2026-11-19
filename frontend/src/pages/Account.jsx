import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, dateVN, money, formData, PAYMENT_LABEL, COMPLAINT_STATUS, WEEKDAYS } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Loading, Notice, StatusBadge } from '../ui.jsx';

export function OrdersPage() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api('/orders').then((d) => setOrders(d.data)).catch(() => setOrders([]));
  }, []);

  if (!orders) return <Loading />;
  if (orders.length === 0) return <Empty>Bạn chưa có đơn hàng nào.</Empty>;

  return (
    <section>
      <h1>Đơn hàng của tôi</h1>
      <table className="table">
        <thead>
          <tr><th>Mã đơn</th><th>Ngày đặt</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th></tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link to={`/orders/${o.code}`}>{o.code}</Link></td>
              <td>{dateVN(o.created_at)}</td>
              <td>{money(o.total)}</td>
              <td>{PAYMENT_LABEL[o.payment_method]}</td>
              <td><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function OrderPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = () =>
    api(`/orders/${code}`)
      .then(setOrder)
      .catch((e) => setMsg({ kind: 'error', text: e.message }));

  useEffect(() => {
    load();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel() {
    if (!window.confirm('Bạn chắc chắn muốn hủy đơn này?')) return;
    try {
      setOrder(await api(`/orders/${code}/cancel`, { method: 'POST' }));
      setMsg({ kind: 'success', text: 'Đã hủy đơn hàng và hoàn lại tồn kho.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  if (!order) return <Notice kind={msg.kind}>{msg.text || 'Đang tải…'}</Notice>;

  const payment = params.get('payment');
  const canCancel = ['pending', 'paid'].includes(order.status);

  return (
    <section>
      <h1>Đơn {order.code}</h1>
      {payment === 'success' && <Notice kind="success">Thanh toán thành công. Cảm ơn bạn!</Notice>}
      {payment === 'failed' && <Notice kind="error">Thanh toán chưa thành công.</Notice>}
      {payment === 'invalid' && <Notice kind="error">Không xác thực được kết quả thanh toán.</Notice>}

      <p>
        <StatusBadge status={order.status} /> · {PAYMENT_LABEL[order.payment_method]} ·{' '}
        {order.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
      </p>

      <table className="table">
        <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td>{i.product_name}</td>
              <td>{money(i.unit_price)}</td>
              <td>{i.quantity}</td>
              <td>{money(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="card summary narrow">
        <div className="line"><span>Tạm tính</span><span>{money(order.subtotal)}</span></div>
        <div className="line"><span>Phí giao hàng</span><span>{money(order.shipping_fee)}</span></div>
        <div className="line"><span>Giảm từ điểm ({order.points_used} điểm)</span><span>- {money(order.points_discount)}</span></div>
        <div className="line total"><span>Tổng cộng</span><strong>{money(order.total)}</strong></div>
        {order.points_earned > 0 && <p className="muted small">Đơn này đã tích được {order.points_earned} điểm.</p>}
      </div>

      <p>Giao đến: {order.shipping_name} · {order.shipping_phone} · {order.shipping_address}</p>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      {canCancel && <button className="danger" onClick={cancel}>Hủy đơn</button>}
    </section>
  );
}

export function PointsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/points').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <Loading />;

  return (
    <section>
      <h1>Điểm tích lũy</h1>
      <p className="big">
        Số dư: <strong>{data.balance}</strong> điểm (tương đương {money(data.balance * data.value_vnd_per_point)})
      </p>
      <p className="muted">{data.earn_rule}. Mỗi điểm được dùng như 1.000 ₫ giảm giá, tối đa 50% giá trị đơn hàng.</p>
      {data.transactions.length === 0 ? (
        <Empty>Chưa có giao dịch điểm.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Nội dung</th><th>Điểm</th></tr></thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id}>
                <td>{dateVN(t.created_at)}</td>
                <td>{t.reason}</td>
                <td className={t.points > 0 ? 'green-text' : 'red-text'}>{t.points > 0 ? `+${t.points}` : t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function SubscriptionsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [subs, setSubs] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [form, setForm] = useState({
    delivery_weekday: 1,
    shipping_name: user?.name ?? '',
    shipping_phone: user?.phone ?? '',
    shipping_address: user?.address ?? '',
  });
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = async () => {
    setPlans(await api('/subscription-plans'));
    setSubs(await api('/subscriptions'));
  };

  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function subscribe(e) {
    e.preventDefault();
    try {
      await api('/subscriptions', {
        method: 'POST',
        body: { ...form, subscription_plan_id: Number(selectedPlan), delivery_weekday: Number(form.delivery_weekday) },
      });
      setMsg({ kind: 'success', text: 'Đăng ký thành công. Hệ thống sẽ tự chốt đơn mỗi tuần trong 1 tháng.' });
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function setStatus(id, status) {
    try {
      await api(`/subscriptions/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  if (!plans) return msg.text ? <Notice kind={msg.kind}>{msg.text}</Notice> : <Loading />;

  return (
    <section>
      <h1>Gói đăng ký hàng tháng</h1>
      <p className="muted">Chọn một gói, ngày nhận hàng trong tuần. Hệ thống tự tạo đơn mỗi tuần (4 lần giao/tháng).</p>
      <Notice kind={msg.kind}>{msg.text}</Notice>

      <div className="grid">
        {plans.map((p) => (
          <div key={p.id} className={`card plan ${String(selectedPlan) === String(p.id) ? 'selected' : ''}`}>
            <h3>{p.name}</h3>
            <p className="muted">{p.description}</p>
            <ul>
              {p.items.map((i) => <li key={i.product_id}>{i.name} × {i.quantity} {i.unit}</li>)}
            </ul>
            <p>
              <span className="muted line-through">{money(p.subtotal)}</span>{' '}
              <strong className="price">{money(p.total)}</strong> / tháng
              {p.discount_percent > 0 && <span className="badge green">-{p.discount_percent}%</span>}
            </p>
            <button className="secondary" onClick={() => setSelectedPlan(p.id)}>Chọn gói này</button>
          </div>
        ))}
      </div>

      {selectedPlan && (
        <form className="card narrow" onSubmit={subscribe}>
          <h2>Thông tin đăng ký</h2>
          <label>
            Ngày nhận hàng trong tuần
            <select value={form.delivery_weekday} onChange={(e) => setForm({ ...form, delivery_weekday: e.target.value })}>
              {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
            </select>
          </label>
          <label>Họ tên<input required value={form.shipping_name} onChange={(e) => setForm({ ...form, shipping_name: e.target.value })} /></label>
          <label>Số điện thoại<input required value={form.shipping_phone} onChange={(e) => setForm({ ...form, shipping_phone: e.target.value })} /></label>
          <label>Địa chỉ<input required value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} /></label>
          <button>Đăng ký gói</button>
        </form>
      )}

      <h2>Gói của tôi</h2>
      {subs.length === 0 ? (
        <Empty>Bạn chưa đăng ký gói nào.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Gói</th><th>Ngày nhận</th><th>Kỳ hạn</th><th>Đơn tiếp theo</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{s.plan?.name}</td>
                <td>{WEEKDAYS[s.delivery_weekday]}</td>
                <td>{dateVN(s.starts_on)} → {dateVN(s.ends_on)}</td>
                <td>{dateVN(s.next_order_on)}</td>
                <td>{s.status}</td>
                <td>
                  {s.status === 'active' && <button className="link" onClick={() => setStatus(s.id, 'paused')}>Tạm dừng</button>}
                  {s.status === 'paused' && <button className="link" onClick={() => setStatus(s.id, 'active')}>Tiếp tục</button>}
                  {['active', 'paused'].includes(s.status) && <button className="link danger-text" onClick={() => setStatus(s.id, 'cancelled')}>Hủy</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ComplaintsPage() {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/complaints').then(setItems).catch((e) => setMsg({ kind: 'error', text: e.message }));

  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    const formEl = e.currentTarget; // capture before the first await
    setBusy(true);
    try {
      await api('/complaints', { method: 'POST', form: formData(formEl) });
      formEl.reset();
      setMsg({ kind: 'success', text: 'Đã gửi khiếu nại. Chúng tôi sẽ phản hồi sớm.' });
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="two-col">
      <form className="card" onSubmit={submit}>
        <h2>Gửi khiếu nại</h2>
        <label>Tiêu đề<input name="subject" required maxLength={150} /></label>
        <label>Mã đơn hàng (nếu có)<input name="order_code" placeholder="FN..." /></label>
        <label>Nội dung<textarea name="content" required rows="5" maxLength={2000} /></label>
        <label>Ảnh minh chứng<input type="file" name="image" accept="image/*" /></label>
        <Notice kind={msg.kind}>{msg.text}</Notice>
        <button disabled={busy}>Gửi khiếu nại</button>
      </form>

      <div>
        <h2>Khiếu nại đã gửi</h2>
        {!items && <Loading />}
        {items && items.length === 0 && <Empty>Bạn chưa gửi khiếu nại nào.</Empty>}
        {items?.map((c) => (
          <div className="card" key={c.id}>
            <strong>{c.subject}</strong> <span className="badge blue">{COMPLAINT_STATUS[c.status]}</span>
            <p>{c.content}</p>
            {c.image_url && <img className="log-media" src={c.image_url} alt="" />}
            {c.admin_reply && <p className="reply"><strong>Phản hồi:</strong> {c.admin_reply}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
