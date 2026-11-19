import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, dateVN, FARM_TYPES } from '../api.js';
import { Badge, Empty, Loading, Notice } from '../ui.jsx';

/** Public traceability page opened by scanning a batch's QR code. */
export function TracePage() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api(`/trace/${encodeURIComponent(code)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [code]);

  if (error) return <Notice kind="error">Không tìm thấy lô hàng với mã này. ({error})</Notice>;
  if (!data) return <Loading />;

  return (
    <section className="trace">
      <div className="card">
        <h1>Truy xuất nguồn gốc</h1>
        <h2>{data.product.name}</h2>
        <dl className="facts">
          <dt>Mã lô</dt><dd>{data.batch_code}</dd>
          <dt>Mã truy xuất</dt><dd>{data.trace_code}</dd>
          <dt>Nông trại</dt><dd>{data.farm_plot?.name ?? '—'}{data.farm_plot?.location ? ` · ${data.farm_plot.location}` : ''}</dd>
          <dt>Chứng nhận</dt><dd>{data.farm_plot?.certification ?? 'Đang cập nhật'}</dd>
          <dt>Ngày thu hoạch</dt><dd>{dateVN(data.harvested_on)}</dd>
          <dt>Hạn sử dụng</dt>
          <dd>
            {dateVN(data.expires_on)}{' '}
            {data.is_expired ? <Badge tone="red">Đã hết hạn</Badge> : <Badge tone="green">Còn hạn</Badge>}
          </dd>
        </dl>
      </div>

      <div className="card qr">
        <QRCodeSVG value={window.location.href} size={160} />
        <p className="muted small">Quét mã để xem lại thông tin này</p>
      </div>

      <h2>Nhật ký canh tác</h2>
      {data.logs.length === 0 ? (
        <Empty>Chưa có nhật ký canh tác cho lô đất này.</Empty>
      ) : (
        <ol className="timeline">
          {data.logs.map((l) => (
            <li key={l.id}>
              <div><strong>{dateVN(l.logged_on)}</strong> · {FARM_TYPES[l.type] ?? l.type}</div>
              <p>{l.description}</p>
              {l.media_url && (l.media_type === 'video'
                ? <video src={l.media_url} controls width="320" />
                : <img className="log-media" src={l.media_url} alt="" />)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
