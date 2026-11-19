import { ORDER_STATUS } from './api.js';

export function Notice({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const STATUS_TONE = {
  pending: 'yellow',
  paid: 'blue',
  shipping: 'blue',
  delivered: 'green',
  cancelled: 'gray',
};

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{ORDER_STATUS[status] ?? status}</Badge>;
}

export function Loading() {
  return <p className="muted">Đang tải…</p>;
}

export function Empty({ children }) {
  return <p className="muted">{children}</p>;
}

export function Stat({ label, value }) {
  return (
    <div className="card stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
