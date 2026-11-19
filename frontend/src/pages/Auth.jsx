import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Notice } from '../ui.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });

  async function submit(e) {
    e.preventDefault();
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Đăng nhập</h1>
      <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Mật khẩu<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <button>Đăng nhập</button>
      <p className="muted">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
    </form>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '', password_confirmation: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });

  async function submit(e) {
    e.preventDefault();
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Tạo tài khoản</h1>
      <label>Họ tên<input required value={form.name} onChange={set('name')} /></label>
      <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
      <label>Số điện thoại<input value={form.phone} onChange={set('phone')} /></label>
      <label>Địa chỉ<input value={form.address} onChange={set('address')} /></label>
      <label>Mật khẩu (tối thiểu 8 ký tự)<input type="password" minLength={8} required value={form.password} onChange={set('password')} /></label>
      <label>Nhập lại mật khẩu<input type="password" minLength={8} required value={form.password_confirmation} onChange={set('password_confirmation')} /></label>
      <Notice kind={msg.kind}>{msg.text}</Notice>
      <button>Đăng ký</button>
      <p className="muted">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
    </form>
  );
}
