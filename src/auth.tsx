import React, { createContext, useContext, useEffect, useState } from 'react';
import { LockKeyhole, LogIn, ShieldAlert } from 'lucide-react';
import { api, clearToken, getToken, setToken, type SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('portal:unauthorized', onUnauthorized);
    return () => window.removeEventListener('portal:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then((r) => setUser(r.user)).catch(() => clearToken()).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    setToken(token);
    setUser(u);
  };
  const logout = () => { clearToken(); setUser(null); };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-visual">
        <div className="login-visual-top">
          <span className="login-visual-mark"><img src="/brand/icon-white.png" alt="" /></span>
          <span className="login-visual-brand">PORTAL <b>KI NTB</b></span>
        </div>
        <div className="login-visual-bottom">
          <p className="login-visual-quote">Satu ruang kerja untuk memantau, mencatat, dan membuktikan kekayaan intelektual Nusa Tenggara Barat.</p>
          <div className="login-visual-office"><b>Kantor Wilayah Kementerian Hukum Nusa Tenggara Barat</b><span>Jalan Majapahit No. 44, Mataram</span></div>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <h1>Masuk ke Portal</h1>
          <p>Gunakan akun internal untuk mengakses dashboard, indikator, dan pusat dokumen.</p>
          <form onSubmit={submit}>
            <label>
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="nama@portalki.ntb.go.id" />
            </label>
            <label>
              Password
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </label>
            {error && <div className="login-error"><ShieldAlert size={16} /> {error}</div>}
            <button type="submit" className="primary-btn" disabled={busy}>
              <LogIn size={17} /> {busy ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
          <div className="login-note"><LockKeyhole size={14} /> Akun diterbitkan oleh administrator kantor. Hubungi Superadmin bila belum memiliki akses.</div>
        </div>
      </div>
    </div>
  );
}
