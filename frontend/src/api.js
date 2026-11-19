// Thin wrapper around fetch for the Laravel API.
export const API = '/api';

export function getToken() {
  return localStorage.getItem('farm_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('farm_token', token);
  else localStorage.removeItem('farm_token');
}

export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Call the API. Pass `body` for JSON or `form` (FormData) for uploads. */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const firstError = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new ApiError(firstError || data?.message || `Lỗi ${res.status}`, res.status, data?.errors || {});
  }

  return data;
}

/** Build FormData from a form element, dropping empty file inputs. */
export function formData(formEl) {
  const fd = new FormData(formEl);
  const file = fd.get('image') || fd.get('media');
  if (file instanceof File && file.size === 0) {
    fd.delete(file === fd.get('image') ? 'image' : 'media');
  }
  return fd;
}

export const money = (n) => `${new Intl.NumberFormat('vi-VN').format(Number(n) || 0)} ₫`;

/** Shows a YYYY-MM-DD (or ISO) value as DD/MM/YYYY without timezone shifts. */
export const dateVN = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const ORDER_STATUS = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
};

export const PAYMENT_LABEL = { cod: 'Thanh toán khi nhận hàng', vnpay: 'VNPay' };

export const COMPLAINT_STATUS = { open: 'Mới', in_progress: 'Đang xử lý', resolved: 'Đã giải quyết' };

export const FARM_TYPES = {
  planting: 'Gieo trồng',
  watering: 'Tưới nước',
  fertilizing: 'Bón phân',
  pest_control: 'Phòng trừ sâu bệnh',
  harvesting: 'Thu hoạch',
  other: 'Khác',
};

export const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
