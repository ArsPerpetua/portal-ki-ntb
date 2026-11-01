import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Activity, Archive, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen,
  BriefcaseBusiness, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, CloudUpload, Command,
  Database, Download, ExternalLink, Eye, FileCheck2, FileClock, FileSpreadsheet,
  FileText, Folder, FolderOpen, Globe2, Grid2X2, HardDrive, Home, Info,
  Landmark, Layers3, LayoutDashboard, LockKeyhole, LogOut, MapPin, MailCheck, Menu,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, ShieldCheck, ShieldAlert,
  SlidersHorizontal, Sparkles, Tags, ThumbsDown, ThumbsUp, TrendingUp, UploadCloud, UserRound,
  UsersRound, X, XCircle, type LucideIcon,
} from 'lucide-react';
import {
  api, ApiError, downloadDocumentBlob, type ApiActivity, type ApiApplication,
  type ApiAssignment, type ApiDocument, type ApiIndicator, type ApiRecordDetailResponse, type ApiUser,
  type IndicatorDetailResponse,
} from './api';
import { AuthProvider, LoginScreen, useAuth } from './auth';
import './style.css';

type NavPage = 'dashboard' | 'indikator' | 'dokumen' | 'aplikasi' | 'aktivitas' | 'pengaturan';
type DocCategory = 'Sambutan' | 'Materi Narasumber' | 'Dokumen Pendukung' | 'Referensi';

const PRESENTATION: Record<string, { icon: LucideIcon; color: string; pale: string; fields: string[] }> = {
  sentra: { icon: Landmark, color: '#3b7c71', pale: '#e7f2ef', fields: ['Nama sentra', 'Lembaga pengelola', 'Kabupaten/Kota', 'Tanggal pembentukan', 'Status'] },
  ig: { icon: MapPin, color: '#c3904e', pale: '#faf0e1', fields: ['Nama produk', 'Asal wilayah', 'Pemegang hak', 'Nomor registrasi', 'Status'] },
  kik: { icon: Layers3, color: '#7381bc', pale: '#eaedfa', fields: ['Nama KIK', 'Jenis KIK', 'Komunitas asal', 'Kabupaten/Kota', 'Status pencatatan'] },
  perda: { icon: BookOpen, color: '#a16c7e', pale: '#f8ecf0', fields: ['Nama peraturan', 'Nomor dan tahun', 'Wilayah', 'Tautan naskah', 'Status'] },
  paten: { icon: Sparkles, color: '#537cba', pale: '#e8eff9', fields: ['Judul invensi', 'Inventor/pemohon', 'Nomor permohonan', 'Tahun', 'Status'] },
  merek: { icon: Tags, color: '#b17c57', pale: '#f8efe7', fields: ['Nama merek', 'Pemilik', 'Kelompok usaha', 'Wilayah', 'Status'] },
  kdmp: { icon: UsersRound, color: '#4a9589', pale: '#e4f4f0', fields: ['Nama merek', 'Nama koperasi', 'Desa/Kelurahan', 'Kabupaten/Kota', 'Status'] },
};
const defaultPresentation = { icon: Database, color: '#398b71', pale: '#eaf5ee', fields: [] as string[] };
const presentationOf = (code: string) => PRESENTATION[code] ?? defaultPresentation;

const APP_ICONS: Record<string, LucideIcon> = { database: Database, briefcase: BriefcaseBusiness, layout: LayoutDashboard, book: BookOpen };

const ROLE_LABEL: Record<string, string> = { SUPERADMIN: 'Administrator', STAF: 'Staf Indikator', PIMPINAN: 'Pimpinan' };
const ROLE_BADGE_CLASS: Record<string, string> = { SUPERADMIN: 'role-badge-admin', STAF: 'role-badge-staf', PIMPINAN: 'role-badge-pimpinan' };
const STATUS_LABEL: Record<string, string> = { VERIFIED: 'Terverifikasi', PENDING_REVIEW: 'Menunggu review', DRAFT: 'Draft', REJECTED: 'Ditolak', ARCHIVED: 'Diarsipkan' };
const STATUS_CLASS: Record<string, string> = { VERIFIED: 'verified', PENDING_REVIEW: 'pending', DRAFT: 'draft', REJECTED: 'rejected', ARCHIVED: 'archived' };
const STATUS_ICON: Record<string, LucideIcon> = { VERIFIED: CheckCircle2, PENDING_REVIEW: Clock3, DRAFT: FileClock, REJECTED: XCircle, ARCHIVED: Archive };

const navs: { name: string; page: NavPage; icon: LucideIcon }[] = [
  { name: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
  { name: 'Indikator KI', page: 'indikator', icon: Grid2X2 },
  { name: 'Pusat Dokumen', page: 'dokumen', icon: FolderOpen },
  { name: 'Katalog Aplikasi', page: 'aplikasi', icon: Globe2 },
  { name: 'Aktivitas', page: 'aktivitas', icon: Activity },
];
const formatNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value);
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '??';
const formatDate = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayLabel = (iso: string) => {
  const diff = Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 86400000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Kemarin';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
};
function groupByDay<T extends { at: string | null; created_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at ?? item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item); else groups.push({ label, items: [item] });
  }
  return groups;
}

function MiniSparkline({ data, color, large = false }: { data: number[]; color: string; large?: boolean }) {
  const w = large ? 340 : 116, h = large ? 112 : 38;
  const max = Math.max(...data) + 2, min = Math.max(0, Math.min(...data) - 3);
  const points = data.map((n, i) => `${(i / (data.length - 1)) * w},${h - 4 - ((n - min) / (max - min || 1)) * (h - 15)}`).join(' ');
  return <svg className={large ? 'sparkline large' : 'sparkline'} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Tren data" preserveAspectRatio="none">
    {large && <><line x1="0" x2={w} y1={h * .3} y2={h * .3} stroke="#e5ecea" strokeDasharray="4 5" /><line x1="0" x2={w} y1={h * .68} y2={h * .68} stroke="#e5ecea" strokeDasharray="4 5" /></>}
    <polyline fill="none" stroke={color} strokeWidth={large ? 3 : 2.3} strokeLinecap="round" strokeLinejoin="round" points={points} className="draw-line" />
    <circle cx={w} cy={Number(points.split(' ').at(-1)?.split(',')[1] ?? 0)} r={large ? 4 : 3} fill={color} />
  </svg>;
}
function Modal({ children }: { children: React.ReactNode }) {
  // Portal ke document.body: .content punya animasi transform (fill-mode "both") yang membuatnya
  // jadi containing block baru untuk descendant position:fixed, sehingga modal tanpa portal akan
  // mengikuti posisi scroll konten alih-alih selalu center ke viewport. Portal menghindari ini.
  return createPortal(children, document.body);
}
function Avatar({ text = '??' }: { text?: string }) { return <div className="avatar" aria-hidden="true">{text}</div>; }
function DotTag({ children, subtle = false }: { children: React.ReactNode; subtle?: boolean }) { return <span className={`dot-tag ${subtle ? 'subtle' : ''}`}><i />{children}</span>; }
function Count({ value }: { value: number }) {
  const [count, setCount] = useState(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCount(value); return; }
    let frame = 0; const start = performance.now();
    const animate = (now: number) => { const p = Math.min(1, (now - start) / 780); setCount(Math.round(value * (1 - (1 - p) ** 3))); if (p < 1) frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{formatNumber(count)}</>;
}
function Empty({ message = 'Tidak ada hasil yang sesuai. Coba kata kunci lain.' }: { message?: string }) { return <div className="empty-state"><Search size={28} /><h3>Belum ada yang ditemukan</h3><p>{message}</p></div>; }
function Loading({ label = 'Memuat data...' }: { label?: string }) { return <div className="loading-state"><Clock3 size={16} /> {label}</div>; }
function ErrorBanner({ message }: { message: string }) { return <div className="inline-banner"><ShieldAlert size={16} /> {message}</div>; }
function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICON[status] ?? Clock3;
  return <span className={`record-status ${STATUS_CLASS[status] ?? ''}`}><Icon size={12} />{STATUS_LABEL[status] ?? status}</span>;
}
function Skeleton({ width = '100%', height = 13, radius = 7, style }: { width?: string | number; height?: number; radius?: number; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}
function IndicatorCardSkeleton() {
  return <div className="indicator-card skeleton-card"><div className="indicator-top"><Skeleton width={41} height={41} radius={10} /><Skeleton width={19} height={19} radius={5} /></div>
    <Skeleton width="70%" height={12} style={{ marginTop: 16 }} /><div className="indicator-metrics"><div><Skeleton width={56} height={26} /><Skeleton width={70} height={9} style={{ marginTop: 7 }} /></div><Skeleton width={90} height={34} radius={8} /></div></div>;
}
function KpiSkeleton() {
  return <div className="kpi-main"><Skeleton width={35} height={35} radius={9} /><Skeleton width={110} height={10} style={{ marginTop: 14 }} /><Skeleton width={70} height={26} style={{ marginTop: 8 }} /><Skeleton width="90%" height={9} style={{ marginTop: 16 }} /></div>;
}
function TableRowSkeleton({ cols }: { cols: number }) {
  return <tr className="skeleton-row">{Array.from({ length: cols }, (_, i) => <td key={i}><Skeleton width={i === 0 ? '70%' : '50%'} /></td>)}</tr>;
}
function AppCardSkeleton() {
  return <div className="app-card skeleton-card"><Skeleton width={65} height={65} radius={15} /><Skeleton width={90} height={9} style={{ marginTop: 19 }} /><Skeleton width="60%" height={13} style={{ marginTop: 10 }} /><Skeleton width="100%" height={11} style={{ marginTop: 9 }} /><Skeleton width="80%" height={11} style={{ marginTop: 6 }} /></div>;
}
function ActivitySkeleton({ count = 4 }: { count?: number }) {
  return <div className="activity-list">{Array.from({ length: count }, (_, i) => <div className="activity-item" key={i}><div className="activity-track"><Skeleton width={32} height={32} radius={9} />{i < count - 1 && <span className="activity-connector" />}</div>
    <div className="activity-info" style={{ paddingTop: 2, width: '100%' }}><Skeleton width="55%" height={11} /><Skeleton width="80%" height={10} style={{ marginTop: 9 }} /><Skeleton width={70} height={9} style={{ marginTop: 11 }} /></div></div>)}</div>;
}

function Dropdown({ value, onChange, options, icon: Icon, ariaLabel, placeholder = 'Pilih' }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
  icon?: LucideIcon; ariaLabel: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const current = options.find((o) => o.value === value);
  return <div className="dropdown" ref={ref}>
    <button type="button" className="dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
      {Icon && <Icon size={15} />}<span>{current?.label ?? placeholder}</span><ChevronDown size={14} className={`dropdown-chevron ${open ? 'open' : ''}`} />
    </button>
    {open && <ul className="dropdown-panel" role="listbox" aria-label={ariaLabel}>
      {options.map((o) => <li key={o.value}>
        <button type="button" role="option" aria-selected={o.value === value} className={o.value === value ? 'selected' : ''} onClick={() => { onChange(o.value); setOpen(false); }}>
          <span>{o.label}</span>{o.value === value && <Check size={14} />}
        </button>
      </li>)}
    </ul>}
  </div>;
}

function Shell() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState<NavPage>('dashboard');
  const [selected, setSelected] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('portal_sidebar_collapsed') === '1');
  useEffect(() => { localStorage.setItem('portal_sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [lastRead, setLastRead] = useState(() => Number(localStorage.getItem('portal_notif_lastread') ?? 0));
  const markAllRead = () => { const now = Date.now(); localStorage.setItem('portal_notif_lastread', String(now)); setLastRead(now); };
  const searchInput = useRef<HTMLInputElement>(null);
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 4200); };

  const [indicators, setIndicators] = useState<ApiIndicator[] | null>(null);
  const [indicatorsError, setIndicatorsError] = useState('');
  const loadIndicators = () => {
    api.indicators().then((r) => setIndicators(r.indicators)).catch((e) => setIndicatorsError(e instanceof Error ? e.message : 'Gagal memuat indikator.'));
  };
  useEffect(loadIndicators, []);

  const [documents, setDocuments] = useState<ApiDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState('');
  const loadDocuments = () => {
    api.documents().then((r) => setDocuments(r.documents)).catch((e) => setDocumentsError(e instanceof Error ? e.message : 'Gagal memuat dokumen.'));
  };
  useEffect(loadDocuments, []);

  const [applications, setApplications] = useState<ApiApplication[] | null>(null);
  useEffect(() => { api.applications().then((r) => setApplications(r.applications)).catch(() => setApplications([])); }, []);

  const [activity, setActivity] = useState<ApiActivity[] | null>(null);
  const loadActivity = () => { api.activity().then((r) => setActivity(r.activity)).catch(() => setActivity([])); };
  useEffect(loadActivity, []);
  const hasUnread = (activity ?? []).some((a) => new Date(a.at ?? a.created_at).getTime() > lastRead);

  const [documentSearch, setDocumentSearch] = useState('');
  const [documentCategory, setDocumentCategory] = useState<DocCategory | 'Semua'>('Semua');
  const [filterIndicator, setFilterIndicator] = useState<string | 'all'>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState<DocCategory>('Materi Narasumber');
  const [uploadIndicator, setUploadIndicator] = useState<string | 'none'>('none');
  const [uploading, setUploading] = useState(false);
  const [viewDoc, setViewDoc] = useState<ApiDocument | null>(null);
  const [settingsTab, setSettingsTab] = useState<'akses' | 'integrasi'>('akses');

  const openPage = (p: NavPage) => { setPage(p); setSelected(null); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openIndicator = (id: string) => { setSelected(id); setPage('indikator'); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); setSearchOpen((s) => !s); }
      if (ev.key === '/' && !['INPUT', 'TEXTAREA'].includes((ev.target as HTMLElement).tagName)) { ev.preventDefault(); setSearchOpen(true); }
      if (ev.key === 'Escape') { setSearchOpen(false); setShowUpload(false); setViewDoc(null); setNotifications(false); setNavOpen(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => { if (searchOpen) window.setTimeout(() => searchInput.current?.focus(), 80); }, [searchOpen]);

  const total = useMemo(() => (indicators ?? []).reduce((n, i) => n + i.value, 0), [indicators]);
  const resultDocs = useMemo(() => (documents ?? []).filter((d) =>
    (documentCategory === 'Semua' || d.category === documentCategory) &&
    (filterIndicator === 'all' || (d.indicators ?? []).includes((indicators ?? []).find((i) => i.id === filterIndicator)?.short ?? '__none__')) &&
    (d.title.toLowerCase().includes(documentSearch.toLowerCase()) || d.category.toLowerCase().includes(documentSearch.toLowerCase())),
  ), [documents, documentCategory, filterIndicator, documentSearch, indicators]);
  const overallResults = useMemo(() => {
    const q = search.toLowerCase().trim();
    const inds = indicators ?? [], docs = documents ?? [];
    if (!q) return { indicator: inds, documents: docs.slice(0, 4) };
    return {
      indicator: inds.filter((i) => (i.label + ' ' + i.short).toLowerCase().includes(q)),
      documents: docs.filter((d) => (d.title + ' ' + d.category).toLowerCase().includes(q)),
    };
  }, [search, documents, indicators]);

  const canUploadDocuments = user?.role === 'STAF' || user?.role === 'SUPERADMIN';

  const submitUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return;
    if (uploadFile.size > 10 * 1024 * 1024) { showToast('Ukuran maksimal unggahan adalah 10 MiB.'); return; }
    setUploading(true);
    try {
      await api.uploadDocument({
        file: uploadFile,
        title: uploadTitle.trim(),
        category: uploadType,
        indicatorCode: uploadIndicator !== 'none' ? uploadIndicator : undefined,
      });
      setShowUpload(false); setUploadFile(null); setUploadTitle('');
      loadDocuments(); loadActivity();
      setPage('dokumen'); setDocumentCategory('Semua'); setFilterIndicator('all'); setDocumentSearch('');
      showToast('Dokumen tersimpan di Google Drive.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengunggah dokumen.');
    } finally {
      setUploading(false);
    }
  };

  const downloadDoc = async (d: ApiDocument) => {
    try {
      await downloadDocumentBlob(d.id, d.title);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengunduh dokumen.');
    }
  };

  if (!user) return null;

  return <div className="shell">
    {navOpen && <div className="mobile-scrim" onClick={() => setNavOpen(false)} />}
    <aside className={`sidebar ${navOpen ? 'mobile-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <button className="brand" onClick={() => openPage('dashboard')} aria-label="Kembali ke Dashboard">
        <span className="brand-mark"><img src="/brand/icon-white.png" alt="" /></span>
        <span className="brand-text">PORTAL <b>KI NTB</b><small>Ruang Informasi Digital</small></span>
      </button>
      <div className="workspace-label"><span className="workspace-dot" /> KANTOR WILAYAH <ChevronDown size={14} /></div>
      <div className="nav-heading">MENU UTAMA</div>
      <nav aria-label="Menu utama">
        {navs.map((n) => <button key={n.page} className={`nav-item ${page === n.page ? 'active' : ''}`} onClick={() => openPage(n.page)} title={collapsed ? n.name : undefined}><n.icon size={19} strokeWidth={1.9} />
          <span>{n.name}</span>{n.page === 'dokumen' && documents && <span className="nav-count">{documents.length}</span>}
        </button>)}
      </nav>
      {user.role === 'SUPERADMIN' && <>
        <div className="nav-heading second-heading">PENGELOLAAN</div>
        <nav aria-label="Pengelolaan"><button className={`nav-item ${page === 'pengaturan' ? 'active' : ''}`} onClick={() => openPage('pengaturan')} title={collapsed ? 'Pengaturan & Akses' : undefined}><Settings2 size={19} /><span>Pengaturan & Akses</span></button></nav>
      </>}
      <div className="sidebar-bottom">
        <div className="side-profile"><Avatar text={initialsOf(user.fullName)} /><div><b>{user.fullName}</b><small className={`role-badge ${ROLE_BADGE_CLASS[user.role] ?? ''}`}>{ROLE_LABEL[user.role] ?? user.role}</small></div>
          <button className="icon-btn" aria-label="Keluar" title="Keluar" onClick={() => { logout(); showToast('Anda telah keluar.'); }}><LogOut size={18} /></button>
        </div>
      </div>
    </aside>

    <div className="main-column">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn menu-toggle" aria-label="Buka menu" onClick={() => setNavOpen(true)}><Menu size={22} /></button>
          <button className="icon-btn sidebar-toggle-btn" aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'} title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="breadcrumbs">Portal KI NTB <ChevronRight size={14} /> <strong>{selected ? (indicators ?? []).find((i) => i.id === selected)?.short : navs.find((n) => n.page === page)?.name || 'Pengaturan & Akses'}</strong></div>
        </div>
        <div className="topbar-actions"><button className="top-search" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Cari data, dokumen...</span><kbd>⌘ K</kbd></button>
          <button className="icon-btn help-btn" title="Bantuan" aria-label="Bantuan" onClick={() => showToast('Gunakan menu di kiri, buka kartu indikator, atau tambah dokumen.')}><CircleHelp size={19} /></button>
          <button className="icon-btn notify-btn" onClick={() => setNotifications((n) => !n)} aria-label="Notifikasi">{hasUnread && <i />}<Bell size={19} /></button>
          <div className="header-avatar"><Avatar text={initialsOf(user.fullName)} /></div>
        </div>
        {notifications && <div className="notification-pop">
          <div className="pop-title"><b>Aktivitas terbaru</b>
            <div className="pop-title-actions">{hasUnread && <button className="pop-mark-read" onClick={markAllRead}><MailCheck size={13} /> Tandai dibaca</button>}
              <button onClick={() => setNotifications(false)} aria-label="Tutup notifikasi"><X size={17} /></button></div></div>
          <div className="notification-scroll">
            {!activity && Array.from({ length: 3 }, (_, i) => <div className="notification-item" key={i}><Skeleton width={28} height={28} radius={8} /><div><Skeleton width={140} height={10} /><Skeleton width={100} height={9} style={{ marginTop: 8 }} /></div></div>)}
            {activity && activity.length === 0 && <div className="notification-item"><span className="notification-icon"><Bell size={14} /></span><div><b>Belum ada aktivitas</b></div></div>}
            {groupByDay(activity ?? []).map((group) => <div key={group.label}>
              <div className="notification-group-label">{group.label}</div>
              {group.items.map((l) => {
                const unread = new Date(l.at ?? l.created_at).getTime() > lastRead;
                const Icon = l.kind === 'document' ? FileText : l.status === 'VERIFIED' ? CheckCheck : FileClock;
                return <div className={`notification-item ${unread ? 'unread' : ''}`} key={l.id}><span className="notification-icon"><Icon size={14} /></span><div><b>{l.title}</b><small>{l.context} • {formatDate(l.at ?? l.created_at)}</small></div></div>;
              })}
            </div>)}
          </div>
        </div>}
      </header>
      <div className="demo-ribbon"><span className="demo-indicator" /> LOKAL — tersambung ke PostgreSQL di komputer Anda. Google Drive & Netlify belum diaktifkan; berkas tersimpan di server lokal.</div>
      <main className="content" key={`${page}-${selected || 'none'}`}>
        {page === 'dashboard' && <>
          <div className="page-title-row"><div><h1>Selamat datang kembali, {user.fullName.split(' ')[0]} <span className="hello-wave">✳</span></h1>
            <p>{user.role === 'PIMPINAN' ? 'Mode baca — angka dan dokumen yang sudah terverifikasi dan diizinkan untuk Anda.' : user.role === 'SUPERADMIN' ? 'Ringkasan sistem, data, dan pengelolaan akses Portal KI NTB.' : 'Gambaran indikator yang Anda kelola dan statistik terkini Portal KI NTB.'}</p></div>
            <div className="date-pill"><CalendarDays size={16} /> {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
          <div className="hero">
            <div className="hero-grid-glow" />
            <div className="hero-copy"><span className="hero-kicker"><span /> INFORMASI TERPUSAT</span><h2>Satu ruang untuk setiap <em>potensi intelektual</em> NTB.</h2><p>Akses indikator, telusuri pencatatan, dan temukan dokumen penting lebih cepat.</p><button className="hero-cta" onClick={() => openPage('indikator')}>Eksplorasi indikator <ArrowUpRight size={17} /></button></div>
            <div className="hero-art" aria-hidden="true"><div className="art-glow" /><div className="art-ring art-ring-1" /><div className="art-ring art-ring-2" /><div className="art-ring art-ring-3" /><div className="art-stroke art-stroke-a" /><div className="art-stroke art-stroke-b" /><div className="art-glass"><div className="art-lines"><i /><i /><i /></div><div className="art-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="art-glass-foot"><span /><span /></div></div><span className="art-star star-1">✦</span><span className="art-star star-2">✧</span></div>
          </div>
          {indicatorsError && <ErrorBanner message={indicatorsError} />}
          {!indicators ? <>
            <div className="kpi-strip">{Array.from({ length: 3 }, (_, i) => <KpiSkeleton key={i} />)}</div>
            <div className="section-heading"><div><div className="section-overline">DATA TERPANTAU</div><h2>7 indikator kekayaan intelektual</h2></div></div>
            <div className="indicator-grid">{Array.from({ length: 7 }, (_, i) => <IndicatorCardSkeleton key={i} />)}</div>
          </> : <>
            <div className="kpi-strip">
              <div className="kpi-main"><div className="kpi-icon"><Database size={20} /></div><span>Total entitas terverifikasi</span><div className="kpi-value"><Count value={total} /><small>entri</small></div><div className="kpi-bottom"><span className="increase"><TrendingUp size={13} /> live</span> dari basis data lokal</div></div>
              <div className="kpi-main"><div className="kpi-icon ochre"><Layers3 size={20} /></div><span>Indikator terpantau</span><div className="kpi-value"><Count value={indicators.length} /><small>kategori</small></div><div className="kpi-bottom"><span className="kpi-ok"><CheckCircle2 size={13} /> aktif</span> dalam sistem</div></div>
              <div className="kpi-main"><div className="kpi-icon violet"><Folder size={20} /></div><span>Dokumen arsip</span><div className="kpi-value"><Count value={documents?.length ?? 0} /><small>file</small></div><div className="kpi-bottom"><span className="kpi-ok"><ShieldCheck size={13} /> Internal</span> akses terkontrol</div></div>
            </div>
            <div className="section-heading"><div><div className="section-overline">DATA TERPANTAU</div><h2>7 indikator kekayaan intelektual</h2><p>Pilih satu kategori untuk melihat ringkasan dan daftar entitas.</p></div><button className="text-action" onClick={() => openPage('indikator')}>Lihat semua <ArrowRight size={17} /></button></div>
            <div className="indicator-grid">{indicators.map((item, n) => <IndicatorCard key={item.id} item={item} index={n} onClick={() => openIndicator(item.id)} />)}</div>
            <div className="bottom-grid">
              <section className="panel trends-panel"><div className="panel-head"><div><span className="section-overline">VISUALISASI</span><h3>Perkembangan indikator</h3></div><span className="pill-minor">Kumulatif terverifikasi</span></div>
                {indicators[0] && <div className="chart-big"><div><strong>{formatNumber(indicators[0].value)} <small>entri {indicators[0].short}</small></strong><p>Kumulatif 7 bulan terakhir</p></div><MiniSparkline data={indicators[0].trend} color={presentationOf(indicators[0].id).color} large /></div>}
                <div className="chart-axis">{Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (6 - i)); return <span key={i}>{d.toLocaleDateString('id-ID', { month: 'short' })}</span>; })}</div>
              </section>
              <section className="panel activity-panel"><div className="panel-head"><div><span className="section-overline">PEMBARUAN</span><h3>Aktivitas terkini</h3></div><button className="square-ghost" aria-label="Lihat aktivitas" onClick={() => openPage('aktivitas')}><ArrowUpRight size={17} /></button></div><ActivityList items={activity} short /></section>
            </div>
          </>}
        </>}

        {page === 'indikator' && !selected && <>
          <PageHeader title="Direktori indikator KI" subtitle="Jelajahi tujuh kategori, pahami definisinya, dan telusuri daftar entri pendukung." action={<DotTag>{indicators?.length ?? 0} indikator</DotTag>} />
          <div className="info-strip"><Info size={19} /><div><b>Angka berasal dari entitas yang berstatus terverifikasi.</b><span>Entri berstatus draft atau menunggu review belum masuk ke angka resmi.</span></div></div>
          {indicatorsError ? <ErrorBanner message={indicatorsError} /> : !indicators ? <div className="indicator-grid directory-grid">{Array.from({ length: 7 }, (_, i) => <IndicatorCardSkeleton key={i} />)}</div> : <div className="indicator-grid directory-grid">{indicators.map((item, n) => <IndicatorCard key={item.id} item={item} index={n} onClick={() => openIndicator(item.id)} showDesc />)}</div>}
        </>}
        {page === 'indikator' && selected && <IndicatorDetailPage code={selected} onBack={() => setSelected(null)}
          onOpenDocs={() => { setFilterIndicator(selected); setDocumentCategory('Semua'); openPage('dokumen'); setFilterIndicator(selected); }}
          onChanged={() => { loadIndicators(); loadActivity(); }}
          showToast={showToast} />}

        {page === 'dokumen' && <>
          <PageHeader title="Pusat dokumen" subtitle="Sambutan, materi narasumber, dan bukti pendukung dalam satu tempat."
            action={canUploadDocuments ? <button className="primary-btn" onClick={() => setShowUpload(true)}><Plus size={17} /> Tambah dokumen</button> : undefined} />
          {documentsError && <ErrorBanner message={documentsError} />}
          {!documents ? <div className="doc-panel panel" style={{ padding: 21 }}>
            <table className="data-table"><tbody>{Array.from({ length: 5 }, (_, i) => <TableRowSkeleton key={i} cols={5} />)}</tbody></table>
          </div> : <>
            <div className="doc-stats"><div><FolderOpen size={20} /><span><strong>{documents.length}</strong><small>Total dokumen</small></span></div>
              <div><FileCheck2 size={20} /><span><strong>{documents.filter((d) => d.category === 'Materi Narasumber').length}</strong><small>Materi narasumber</small></span></div>
              <div><FileText size={20} /><span><strong>{documents.filter((d) => d.category === 'Sambutan').length}</strong><small>Naskah sambutan</small></span></div>
              <div><ShieldCheck size={20} /><span><strong>Privat</strong><small>Skema akses</small></span></div></div>
            <div className="doc-panel panel"><div className="doc-panel-top"><div className="doc-tabs">{(['Semua', 'Sambutan', 'Materi Narasumber', 'Dokumen Pendukung', 'Referensi'] as const).map((tab) => <button className={documentCategory === tab ? 'selected' : ''} key={tab} onClick={() => setDocumentCategory(tab)}>{tab}</button>)}</div>
              <div className="document-controls"><label className="input-search"><Search size={17} /><input placeholder="Cari nama dokumen..." value={documentSearch} onChange={(e) => setDocumentSearch(e.target.value)} /></label>
                <Dropdown ariaLabel="Filter indikator" icon={SlidersHorizontal} value={filterIndicator} onChange={setFilterIndicator}
                  options={[{ value: 'all', label: 'Semua indikator' }, ...(indicators ?? []).map((i) => ({ value: i.id, label: i.short }))]} /></div></div>
              <div className="table-scroll"><table className="data-table document-table"><thead><tr><th>Nama dokumen</th><th>Kategori</th><th>Terkait KI</th><th>Tanggal</th><th>Ukuran</th><th></th></tr></thead>
                <tbody>{resultDocs.map((doc) => <tr key={doc.id} onClick={() => setViewDoc(doc)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setViewDoc(doc); }}>
                  <td><span className="file-icon"><FileText size={20} /></span><span className="file-cell-text"><b>{doc.title}</b><small>{doc.owner_name ?? 'Tidak diketahui'} • {doc.mime_type.split('/').pop()?.toUpperCase()}</small></span></td>
                  <td><span className="table-pill">{doc.category}</span></td><td>{doc.indicators?.join(', ') || 'Umum'}</td><td>{formatDate(doc.created_at)}</td><td>{(doc.size_bytes / 1048576).toFixed(1)} MB</td>
                  <td><button className="row-action" title="Detail" onClick={(e) => { e.stopPropagation(); setViewDoc(doc); }}><ArrowUpRight size={17} /></button></td>
                </tr>)}</tbody></table></div>
              {resultDocs.length === 0 && <Empty />}
              <div className="table-foot"><span>Menampilkan {resultDocs.length} dari {documents.length} dokumen</span><span><LockKeyhole size={14} /> Dokumen privat secara default</span></div>
            </div>
          </>}
        </>}

        {page === 'aplikasi' && <>
          <PageHeader title="Katalog aplikasi" subtitle="Temukan pintasan ke layanan dan aplikasi pendukung pekerjaan KI." />
          <div className="info-strip"><Info size={19} /><div><b>Katalog dikelola oleh Superadmin.</b><span>Isi URL resmi dan ikon aplikasi lewat Pengaturan & Akses pada sistem produksi.</span></div></div>
          {!applications ? <div className="apps-grid">{Array.from({ length: 4 }, (_, i) => <AppCardSkeleton key={i} />)}</div> : applications.length === 0 ? <Empty message="Belum ada aplikasi pada katalog." /> : <div className="apps-grid">{applications.map((a) => {
            const Icon = APP_ICONS[a.icon ?? ''] ?? Globe2;
            return <button className="app-card" key={a.id} onClick={() => a.url && a.url !== '#' ? window.open(a.url, '_blank', 'noopener') : showToast('URL aplikasi belum dikonfigurasi.')}>
              <span className="app-graphic" style={{ background: '#e5f4ee' }}><Icon size={30} /></span><span className="app-badge">KATALOG INTERNAL</span><b>{a.name}</b><p>{a.description}</p><span className="app-link">Lihat detail <ArrowUpRight size={16} /></span>
            </button>;
          })}</div>}
        </>}

        {page === 'aktivitas' && <>
          <PageHeader title="Riwayat aktivitas" subtitle="Rekam jejak perubahan data dan dokumen terbaru." action={<DotTag>Live</DotTag>} />
          <div className="activity-layout"><section className="panel activity-full"><div className="panel-head"><div><span className="section-overline">JEJAK PERUBAHAN</span><h3>Aktivitas terbaru</h3></div><span className="pill-minor">Pembaruan data & dokumen</span></div>
            {!activity ? <ActivitySkeleton count={6} /> : activity.length === 0 ? <Empty message="Belum ada aktivitas tercatat." /> : <ActivityList items={activity} />}</section>
            <section className="panel status-card"><div className="status-icon"><ShieldCheck size={27} /></div><h3>Audit log sejak hari pertama</h3>
              <p>{user.role === 'SUPERADMIN' ? 'Sebagai Superadmin, Anda dapat meninjau audit log lengkap (aktor, waktu, dan aksi) pada basis data.' : 'Setiap perubahan administrasi disimpan bersama identitas pelaku dan waktu. Tinjauan penuh tersedia untuk Superadmin.'}</p>
              <div className="status-row"><Check size={16} /> Identitas pengubah</div><div className="status-row"><Check size={16} /> Waktu & jenis aksi</div><div className="status-row"><Check size={16} /> Tersimpan di tabel audit_logs</div>
            </section></div>
        </>}

        {page === 'pengaturan' && <SettingsPage settingsTab={settingsTab} setSettingsTab={setSettingsTab} indicators={indicators ?? []} showToast={showToast} />}

        <footer className="footer"><span>© 2026 Portal Digital KI NTB</span><span>Dijalankan secara lokal <span className="footer-dot">•</span> PostgreSQL + Express</span></footer>
      </main>
    </div>

    {searchOpen && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}><div className="search-modal" role="dialog" aria-modal="true" aria-label="Pencarian global">
      <div className="search-modal-input"><Search size={22} /><input ref={searchInput} placeholder="Cari indikator KI, materi, sambutan..." value={search} onChange={(e) => setSearch(e.target.value)} /><button onClick={() => setSearchOpen(false)}>ESC</button></div>
      <div className="search-results"><div className="search-category">INDIKATOR KI</div>{overallResults.indicator.slice(0, 7).map((i) => <button key={i.id} className="search-result" onClick={() => { openIndicator(i.id); setSearchOpen(false); setSearch(''); }}><span className="result-icon"><Layers3 size={17} /></span><span><b>{i.short}</b><small>{i.label}</small></span><ArrowUpRight size={16} /></button>)}
        <div className="search-category second">DOKUMEN</div>{overallResults.documents.slice(0, 5).map((d) => <button className="search-result" key={d.id} onClick={() => { setViewDoc(d); setSearchOpen(false); setSearch(''); }}><span className="result-icon"><FileText size={17} /></span><span><b>{d.title}</b><small>{d.category}</small></span><ArrowUpRight size={16} /></button>)}
        {overallResults.indicator.length + overallResults.documents.length === 0 && <Empty />}</div>
      <div className="search-modal-foot">Tekan <kbd>ESC</kbd> untuk menutup <span><kbd>⌘</kbd> + <kbd>K</kbd> untuk membuka</span></div></div></div></Modal>}

    {showUpload && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}><div className="upload-modal" role="dialog" aria-modal="true" aria-label="Tambah dokumen">
      <div className="modal-head"><div><span className="section-overline">PUSAT DOKUMEN</span><h3>Tambah dokumen</h3><p>Berkas disimpan di server lokal (maks 10 MiB).</p></div><button className="icon-btn" onClick={() => setShowUpload(false)} aria-label="Tutup"><X size={20} /></button></div>
      <label className="dropzone"><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0] || null; setUploadFile(f); if (f && !uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, '')); }} />
        <span className="dropzone-icon"><CloudUpload size={26} /></span><b>{uploadFile ? uploadFile.name : 'Klik untuk pilih dokumen'}</b><small>{uploadFile ? `${(uploadFile.size / 1048576).toFixed(2)} MiB` : 'PDF, DOCX, PPTX, XLSX, JPG, PNG • maks. 10 MiB'}</small></label>
      <div className="form-row"><label className="form-row-full">Judul dokumen<input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Judul yang akan ditampilkan" /></label>
        <label>Kategori dokumen<Dropdown ariaLabel="Kategori dokumen" value={uploadType} onChange={(v) => setUploadType(v as DocCategory)}
          options={(['Sambutan', 'Materi Narasumber', 'Dokumen Pendukung', 'Referensi'] as const).map((c) => ({ value: c, label: c }))} /></label>
        <label>Indikator terkait<Dropdown ariaLabel="Indikator terkait" value={uploadIndicator} onChange={setUploadIndicator}
          options={[{ value: 'none', label: 'Umum / tidak spesifik' }, ...(indicators ?? []).map((i) => ({ value: i.id, label: i.short }))]} /></label></div>
      <div className="demo-warning"><Info size={17} /><span>Berkas disimpan di folder lokal server (pengganti sementara Google Drive untuk pengembangan).</span></div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => setShowUpload(false)}>Batal</button>
        <button className="primary-btn" disabled={!uploadFile || !uploadTitle.trim() || uploadFile.size > 10 * 1024 * 1024 || uploading} onClick={submitUpload}><UploadCloud size={17} /> {uploading ? 'Mengunggah...' : 'Simpan dokumen'}</button></div>
    </div></div></Modal>}

    {viewDoc && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewDoc(null); }}><div className="detail-modal" role="dialog" aria-modal="true" aria-label="Detail dokumen">
      <div className="modal-head"><div><span className="section-overline">DETAIL DOKUMEN</span><h3>Informasi berkas</h3></div><button className="icon-btn" onClick={() => setViewDoc(null)} aria-label="Tutup"><X size={20} /></button></div>
      <div className="detail-file-top"><span className="big-file-icon"><FileText size={29} /></span><div><b>{viewDoc.title}</b><small>{viewDoc.mime_type} • {(viewDoc.size_bytes / 1048576).toFixed(2)} MB</small></div></div>
      <div className="detail-fields">{([['Kategori', viewDoc.category], ['Indikator', viewDoc.indicators?.join(', ') || 'Umum'], ['Pengunggah', viewDoc.owner_name ?? '-'], ['Tanggal', formatDate(viewDoc.created_at)], ['Akses', viewDoc.classification === 'RESTRICTED' ? 'Terbatas' : 'Internal'], ['Status', viewDoc.status]] as [string, string][]).map(([key, val]) => <div key={key}><span>{key}</span><b>{val}</b></div>)}</div>
      <div className="demo-warning"><Info size={17} /><span>Unduhan tercatat pada audit log dan diperiksa izin aksesnya oleh server.</span></div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => setViewDoc(null)}>Tutup</button><button className="primary-btn" onClick={() => downloadDoc(viewDoc)}><Download size={17} /> Unduh berkas</button></div>
    </div></div></Modal>}
    {toast && <div className="toast"><Info size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Tutup pesan"><X size={15} /></button></div>}
  </div>;
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div>{action}</div>}</div>;
}
function IndicatorCard({ item, index, onClick, showDesc = false }: { item: ApiIndicator; index: number; onClick: () => void; showDesc?: boolean }) {
  const p = presentationOf(item.id);
  return <button className={`indicator-card ${showDesc ? 'expanded' : ''}`} style={{ '--c': p.color, '--pale': p.pale, '--delay': `${index * 55}ms` } as React.CSSProperties} onClick={onClick}>
    <div className="indicator-top"><div className="indicator-icon"><p.icon size={23} strokeWidth={1.9} /></div><div className="indicator-arrow"><ArrowUpRight size={19} /></div></div>
    <div className="indicator-label">{item.short}</div>{showDesc && <p className="indicator-description">{item.countingDefinition}</p>}
    <div className="indicator-metrics"><div><div className="indicator-number"><Count value={item.value} /></div><span>{item.unit} <i>•</i> {item.isManual ? 'rekap nasional' : 'terverifikasi'}</span></div><MiniSparkline data={item.trend} color={p.color} /></div>
    <div className="indicator-footer">{item.isManual ? <span><Info size={13} /> Angka sementara, menunggu data per-entitas</span> : <span><TrendingUp size={13} /> {item.delta >= 0 ? '+' : ''}{item.delta} bulan ini</span>}<ArrowRight size={16} /></div>
  </button>;
}
function ActivityList({ items, short = false }: { items: ApiActivity[] | null; short?: boolean }) {
  const list = (items ?? []).slice(0, short ? 3 : 8);
  return <div className={`activity-list ${short ? 'compact' : ''}`}>{list.map((item, index) => {
    const Icon = item.kind === 'document' ? FileText : item.status === 'VERIFIED' ? CheckCheck : FileClock;
    return <div className="activity-item" key={`${item.kind}-${item.id}`}><div className="activity-track"><span className="activity-symbol"><Icon size={17} /></span>{index < list.length - 1 && <span className="activity-connector" />}</div>
      <div className="activity-info"><b>{item.title}</b><p>{item.kind === 'document' ? `Dokumen • ${item.context}` : `${item.context} • ${STATUS_LABEL[item.status] ?? item.status}`}</p><small><Clock3 size={12} />{formatDate(item.at ?? item.created_at)}</small></div>
    </div>;
  })}</div>;
}

function IndicatorDetailPage({ code, onBack, onOpenDocs, onChanged, showToast }: {
  code: string; onBack: () => void; onOpenDocs: () => void; onChanged: () => void; showToast: (m: string) => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<IndicatorDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('semua');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', district: '', year: new Date().getFullYear(), referenceNo: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewRecordId, setViewRecordId] = useState<string | null>(null);
  const [recordDetail, setRecordDetail] = useState<ApiRecordDetailResponse | null>(null);

  const load = () => { api.indicatorDetail(code).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat indikator.')); };
  useEffect(() => { load(); setRegion('semua'); }, [code]);
  useEffect(() => {
    if (!viewRecordId) { setRecordDetail(null); return; }
    api.recordDetail(viewRecordId).then(setRecordDetail).catch(() => { showToast('Gagal memuat detail entitas.'); setViewRecordId(null); });
  }, [viewRecordId]);

  if (error) return <><button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Kembali ke direktori</button><ErrorBanner message={error} /></>;
  if (!detail) return <div className="indicator-detail">
    <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Kembali ke direktori</button>
    <div className="detail-heading"><Skeleton width={62} height={62} radius={13} /><div><Skeleton width={220} height={22} /><Skeleton width={160} height={11} style={{ marginTop: 10 }} /></div></div>
    <div className="detail-hero skeleton-card" style={{ minHeight: 200 }} />
    <div className="panel records-panel" style={{ padding: 21 }}><table className="data-table"><tbody>{Array.from({ length: 4 }, (_, i) => <TableRowSkeleton key={i} cols={4} />)}</tbody></table></div>
  </div>;

  const p = presentationOf(code);
  const rows = detail.records.filter((r) => region === 'semua' || r.district === region);
  const regions = [...new Set(detail.records.map((r) => r.district))];
  const verifiedCount = detail.records.filter((r) => r.status === 'VERIFIED').length;
  const pendingCount = detail.records.filter((r) => r.status === 'PENDING_REVIEW').length;
  const isManual = detail.indicator.mode === 'MANUAL' && detail.indicator.manual_value != null;
  const headlineValue = isManual ? detail.indicator.manual_value! : verifiedCount;
  const canWrite = user?.role === 'SUPERADMIN' || detail.assignment?.can_write;
  const canVerify = user?.role === 'SUPERADMIN' || detail.assignment?.can_verify;

  const submitCreate = async () => {
    if (!form.name.trim() || !form.district.trim()) return;
    setSubmitting(true);
    try {
      await api.createRecord(code, { name: form.name.trim(), district: form.district.trim(), year: Number(form.year), referenceNo: form.referenceNo.trim() || undefined, description: form.description.trim() || undefined });
      setShowCreate(false); setForm({ name: '', district: '', year: new Date().getFullYear(), referenceNo: '', description: '' });
      load(); onChanged();
      showToast('Entitas tersimpan, menunggu review.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan entitas.');
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (id: string, decision: 'VERIFIED' | 'REJECTED', reason?: string) => {
    try {
      await api.verifyRecord(id, decision, reason);
      load(); onChanged();
      showToast(decision === 'VERIFIED' ? 'Entitas diverifikasi.' : 'Entitas ditolak.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memproses verifikasi.');
    }
  };

  return <div className="indicator-detail">
    <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Kembali ke direktori</button>
    <div className="detail-heading"><span className="detail-head-icon" style={{ background: p.pale, color: p.color }}><p.icon size={29} /></span>
      <div><h1>{detail.indicator.name}</h1><p>Ringkasan definisi, monitoring, dan daftar entitas.</p></div>
      <DotTag subtle>{isManual ? 'Rekap nasional (sementara)' : 'Derived'}</DotTag></div>
    {isManual && <div className="info-strip"><Info size={19} /><div><b>Angka ini sementara, diambil dari rekap nasional DJKI (Pangkalan Data KI, provinsi NTB).</b><span>Daftar entitas di bawah masih kosong sampai data per-entitas riil diimpor.</span></div></div>}
    <div className="detail-hero"><div className="detail-hero-copy"><span className="tiny-label">MENGENAL {detail.indicator.short_name.toUpperCase()}</span><h2>{detail.indicator.short_name} di Nusa Tenggara Barat</h2>
      <p>{detail.content?.body_md ?? detail.indicator.counting_definition}</p><button onClick={onOpenDocs}>Dokumen terkait <ArrowUpRight size={17} /></button></div>
      <div className="detail-number"><small>{isManual ? 'TOTAL (REKAP NASIONAL)' : 'TOTAL TERVERIFIKASI'}</small><div><Count value={headlineValue} /></div><span>{detail.indicator.unit}</span><MiniSparkline data={[headlineValue, headlineValue]} color={p.color} large /></div></div>
    <div className="detail-mini-grid"><div className="detail-mini"><span><CheckCircle2 size={18} /></span><b>Data terverifikasi</b><strong>{verifiedCount} <small>entri</small></strong></div>
      <div className="detail-mini"><span><Clock3 size={18} /></span><b>Perlu tinjauan</b><strong>{pendingCount} <small>entri</small></strong></div>
      <div className="detail-mini"><span><CalendarDays size={18} /></span><b>Definisi penghitungan</b><strong className="date-value">{detail.indicator.counting_definition.length > 30 ? detail.indicator.counting_definition.slice(0, 30) + '…' : detail.indicator.counting_definition}</strong></div></div>

    <div className="panel records-panel"><div className="panel-head"><div><span className="section-overline">DIREKTORI DATA</span><h3>Daftar entitas {detail.indicator.short_name}</h3><p>Status menentukan apakah entri sudah dihitung sebagai angka resmi.</p></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Dropdown ariaLabel="Filter wilayah" icon={SlidersHorizontal} value={region} onChange={setRegion}
          options={[{ value: 'semua', label: 'Semua wilayah' }, ...regions.map((r) => ({ value: r, label: r }))]} />
        {canWrite && <button className="chip-btn" onClick={() => setShowCreate(true)}><Plus size={14} /> Tambah entitas</button>}
      </div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nama entitas</th><th>Wilayah</th><th>Tahun</th><th>Status</th>{canVerify && <th></th>}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="clickable" onClick={() => setViewRecordId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setViewRecordId(r.id); }}>
          <td><b>{r.name}</b></td><td>{r.district}</td><td>{r.year}</td>
          <td><StatusBadge status={r.status} /></td>
          {canVerify && <td>{r.status === 'PENDING_REVIEW' && <div className="table-actions">
            <button className="chip-btn" onClick={(e) => { e.stopPropagation(); decide(r.id, 'VERIFIED'); }} title="Verifikasi"><ThumbsUp size={13} /></button>
            <button className="chip-btn danger" onClick={(e) => { e.stopPropagation(); setRejectTarget(r.id); }} title="Tolak"><ThumbsDown size={13} /></button>
          </div>}</td>}
        </tr>)}</tbody></table></div>
      {rows.length === 0 && <Empty message="Belum ada entitas pada wilayah ini." />}
    </div>

    <div className="field-section"><div><span className="section-overline">STRUKTUR INFORMASI</span><h3>Data minimum entitas</h3><p>Sesuai Lampiran A PRD, field berikut menjadi acuan atribut per indikator. Form saat ini mencakup field umum; atribut spesifik dapat diperluas kemudian.</p></div>
      <div className="field-tags">{p.fields.map((f) => <span key={f}><Check size={14} />{f}</span>)}</div></div>

    {showCreate && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}><div className="upload-modal" role="dialog" aria-modal="true" aria-label="Tambah entitas">
      <div className="modal-head"><div><span className="section-overline">{detail.indicator.short_name.toUpperCase()}</span><h3>Tambah entitas</h3><p>Entri baru tersimpan sebagai "Menunggu review" sampai diverifikasi.</p></div><button className="icon-btn" onClick={() => setShowCreate(false)} aria-label="Tutup"><X size={20} /></button></div>
      <div className="form-row"><label className="form-row-full">Nama entitas<input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama sesuai definisi indikator" /></label>
        <label>Kabupaten/Kota<input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="Kota Mataram" /></label>
        <label>Tahun<input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} /></label>
        <label className="form-row-full">Nomor referensi (opsional)<input value={form.referenceNo} onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))} placeholder="Nomor pencatatan/registrasi" /></label>
        <label className="form-row-full">Deskripsi singkat (opsional)<textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Jelaskan singkat entitas ini: apa, dari mana, dan konteksnya." /></label></div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => setShowCreate(false)}>Batal</button>
        <button className="primary-btn" disabled={!form.name.trim() || !form.district.trim() || submitting} onClick={submitCreate}><Plus size={17} /> {submitting ? 'Menyimpan...' : 'Simpan entitas'}</button></div>
    </div></div></Modal>}

    {rejectTarget && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setRejectTarget(null); }}><div className="detail-modal" role="dialog" aria-modal="true" aria-label="Tolak entitas">
      <div className="modal-head"><div><span className="section-overline">VERIFIKASI</span><h3>Tolak entitas</h3><p>Alasan ini akan tercatat pada audit log.</p></div><button className="icon-btn" onClick={() => setRejectTarget(null)} aria-label="Tutup"><X size={20} /></button></div>
      <div className="form-row"><label className="form-row-full">Alasan penolakan<textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Jelaskan alasan penolakan..." /></label></div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => setRejectTarget(null)}>Batal</button>
        <button className="primary-btn" onClick={() => { decide(rejectTarget, 'REJECTED', rejectReason || undefined); setRejectTarget(null); setRejectReason(''); }}><ThumbsDown size={17} /> Tolak entitas</button></div>
    </div></div></Modal>}

    {viewRecordId && <Modal><div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewRecordId(null); }}><div className="detail-modal" role="dialog" aria-modal="true" aria-label="Detail entitas">
      <div className="modal-head"><div><span className="section-overline">{detail.indicator.short_name.toUpperCase()}</span><h3>Detail entitas</h3></div><button className="icon-btn" onClick={() => setViewRecordId(null)} aria-label="Tutup"><X size={20} /></button></div>
      {!recordDetail ? <Loading label="Memuat detail..." /> : <>
        <div className="detail-file-top"><span className="big-file-icon" style={{ background: p.pale, color: p.color }}><p.icon size={24} /></span>
          <div><b>{recordDetail.record.name}</b><small>{recordDetail.record.district} • {recordDetail.record.year}</small></div></div>
        <div style={{ margin: '14px 0 18px' }}><StatusBadge status={recordDetail.record.status} /></div>
        <p className={`detail-description ${recordDetail.record.description ? '' : 'empty'}`}>{recordDetail.record.description || 'Belum ada deskripsi untuk entitas ini.'}</p>
        <div className="detail-fields">
          {recordDetail.record.reference_no && <div><span>Nomor referensi</span><b>{recordDetail.record.reference_no}</b></div>}
          <div><span>Dibuat oleh</span><b>{recordDetail.record.created_by_name ?? '—'}</b></div>
          <div><span>Tanggal dibuat</span><b>{formatDate(recordDetail.record.created_at)}</b></div>
          {recordDetail.record.status === 'VERIFIED' && <>
            <div><span>Diverifikasi oleh</span><b>{recordDetail.record.verified_by_name ?? '—'}</b></div>
            <div><span>Tanggal verifikasi</span><b>{formatDate(recordDetail.record.verified_at)}</b></div>
          </>}
          {recordDetail.record.status === 'REJECTED' && <div><span>Alasan ditolak</span><b>{recordDetail.record.rejection_reason || '—'}</b></div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <span className="section-overline" style={{ display: 'block', marginBottom: 10 }}>DOKUMEN BUKTI</span>
          {recordDetail.documents.length === 0 ? <p style={{ fontSize: 11, color: '#93a29a', lineHeight: 1.6 }}>Belum ada dokumen yang ditautkan ke entitas ini.</p> : <div style={{ display: 'grid', gap: 8 }}>
            {recordDetail.documents.map((d) => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #edf2ee', borderRadius: 8, padding: '9px 11px' }}>
              <FileText size={16} style={{ color: '#96a89d', flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 11, color: '#3d5749', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
              <button className="row-action" title="Unduh" onClick={() => downloadDocumentBlob(d.id, d.title)}><Download size={15} /></button>
            </div>)}
          </div>}
        </div>
        {recordDetail.canVerify && recordDetail.record.status === 'PENDING_REVIEW' && <div className="modal-actions">
          <button className="secondary-btn" onClick={() => { setViewRecordId(null); setRejectTarget(recordDetail.record.id); }}><ThumbsDown size={16} /> Tolak</button>
          <button className="primary-btn" onClick={() => { decide(recordDetail.record.id, 'VERIFIED'); setViewRecordId(null); }}><ThumbsUp size={16} /> Verifikasi</button>
        </div>}
      </>}
    </div></div></Modal>}
  </div>;
}

function SettingsPage({ settingsTab, setSettingsTab, indicators, showToast }: {
  settingsTab: 'akses' | 'integrasi'; setSettingsTab: (t: 'akses' | 'integrasi') => void; indicators: ApiIndicator[]; showToast: (m: string) => void;
}) {
  const { user } = useAuth();
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [assignments, setAssignments] = useState<ApiAssignment[] | null>(null);
  const [assignForm, setAssignForm] = useState({ userId: '', indicatorCode: '', canWrite: true, canVerify: false });
  const isAdmin = user?.role === 'SUPERADMIN';

  const loadAdmin = () => {
    if (!isAdmin) return;
    api.adminUsers().then((r) => setUsers(r.users)).catch(() => setUsers([]));
    api.adminAssignments().then((r) => setAssignments(r.assignments)).catch(() => setAssignments([]));
  };
  useEffect(loadAdmin, [isAdmin]);

  const submitAssign = async () => {
    if (!assignForm.userId || !assignForm.indicatorCode) return;
    try {
      await api.adminAssign(assignForm);
      loadAdmin();
      showToast('Penugasan tersimpan.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan penugasan.');
    }
  };
  const removeAssign = async (id: string) => {
    try { await api.adminUnassign(id); loadAdmin(); showToast('Penugasan dihapus.'); }
    catch (err) { showToast(err instanceof ApiError ? err.message : 'Gagal menghapus penugasan.'); }
  };

  return <>
    <PageHeader title="Pengaturan & akses" subtitle="Kontrol peran, penugasan indikator, dan status integrasi layanan." />
    <div className="settings-tabs"><button className={settingsTab === 'akses' ? 'selected' : ''} onClick={() => setSettingsTab('akses')}><UsersRound size={17} /> Peran & hak akses</button>
      <button className={settingsTab === 'integrasi' ? 'selected' : ''} onClick={() => setSettingsTab('integrasi')}><HardDrive size={17} /> Integrasi layanan</button></div>
    {settingsTab === 'akses' ? <div className="settings-layout">
      <section className="panel settings-main"><div className="panel-head"><div><span className="section-overline">KEAMANAN DATA</span><h3>Matriks peran pengguna</h3></div></div>
        <div className="table-scroll"><table className="data-table roles-table"><thead><tr><th>Hak akses</th><th>Superadmin</th><th>Staf</th><th>Pimpinan</th></tr></thead><tbody>
          {([['Lihat dashboard', true, true, true], ['Lihat dokumen berizin', true, true, true], ['Kelola data indikator', true, 'assigned', false], ['Upload dokumen', true, true, false], ['Kelola pengguna & penugasan', true, false, false], ['Verifikasi angka resmi', true, 'assigned', false], ['Lihat audit log lengkap', true, false, false]] as [string, boolean | string, boolean | string, boolean | string][])
            .map((row) => <tr key={row[0]}><td><b>{row[0]}</b></td>{row.slice(1).map((cell, i) => <td key={i}>{cell === true ? <span className="role-yes"><Check size={16} /> Ya</span> : cell === 'assigned' ? <span className="role-assigned">Sesuai penugasan</span> : <span className="role-no">—</span>}</td>)}</tr>)}
        </tbody></table></div>

        {isAdmin && <>
          <div className="panel-head" style={{ padding: '20px 21px 0' }}><div><span className="section-overline">PENUGASAN</span><h3>Staf ↔ indikator</h3><p>Hanya Superadmin yang dapat mengubah penugasan (ditegakkan juga oleh RLS di database).</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Staf</th><th>Indikator</th><th>Tulis</th><th>Verifikasi</th><th></th></tr></thead>
            <tbody>{(assignments ?? []).map((a) => <tr key={a.id}><td><b>{a.user_name}</b></td><td>{a.indicator_name}</td><td>{a.can_write ? <Check size={15} /> : '—'}</td><td>{a.can_verify ? <Check size={15} /> : '—'}</td>
              <td><button className="chip-btn danger" onClick={() => removeAssign(a.id)}>Hapus</button></td></tr>)}</tbody></table></div>
          {assignments && assignments.length === 0 && <div style={{ padding: '0 21px 16px' }}><Empty message="Belum ada penugasan." /></div>}
          <div className="assign-form">
            <Dropdown ariaLabel="Pilih staf" placeholder="Pilih staf..." value={assignForm.userId} onChange={(v) => setAssignForm((f) => ({ ...f, userId: v }))}
              options={(users ?? []).filter((u) => u.role === 'STAF').map((u) => ({ value: u.id, label: u.full_name }))} />
            <Dropdown ariaLabel="Pilih indikator" placeholder="Pilih indikator..." value={assignForm.indicatorCode} onChange={(v) => setAssignForm((f) => ({ ...f, indicatorCode: v }))}
              options={indicators.map((i) => ({ value: i.id, label: i.short }))} />
            <label><input type="checkbox" checked={assignForm.canWrite} onChange={(e) => setAssignForm((f) => ({ ...f, canWrite: e.target.checked }))} /> Tulis</label>
            <label><input type="checkbox" checked={assignForm.canVerify} onChange={(e) => setAssignForm((f) => ({ ...f, canVerify: e.target.checked }))} /> Verifikasi</label>
            <button className="chip-btn" onClick={submitAssign}><Plus size={14} /> Tambah</button>
          </div>
        </>}
      </section>
      <section className="panel access-aside"><div className="status-icon"><LockKeyhole size={25} /></div><h3>Indikator bersifat granular</h3><p>Penugasan staf dilakukan per indikator, bukan cukup berdasarkan role global.</p>
        <div className="access-chip"><CheckCircle2 size={16} /> RLS aktif di PostgreSQL</div><div className="access-chip"><CheckCircle2 size={16} /> Validasi backend</div><div className="access-chip"><CheckCircle2 size={16} /> Catatan audit</div></section>
    </div> : <div className="integration-grid">
      {[{ name: 'PostgreSQL lokal', desc: 'Basis data, autentikasi JWT, dan Row Level Security berjalan di komputer ini.', icon: Database, connected: true },
        { name: 'Google Drive', desc: 'File privat melalui akun Gmail arsip khusus kantor. Belum dikonfigurasi untuk lokal.', icon: HardDrive, connected: false },
        { name: 'Netlify', desc: 'Hosting frontend dan Functions untuk produksi. Tidak dipakai saat menjalankan di lokal.', icon: Globe2, connected: false }]
        .map((s) => <div className="panel integration-card" key={s.name}><span><s.icon size={25} /></span><h3>{s.name}</h3><p>{s.desc}</p>
          <div className="integration-status" style={s.connected ? { color: '#228c63' } : undefined}><span className={s.connected ? 'workspace-dot' : 'indicator-not-connected'} /> {s.connected ? 'Terhubung' : 'Belum terhubung'}</div></div>)}
    </div>}
  </>;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-shell"><Loading label="Memeriksa sesi..." /></div>;
  if (!user) return <LoginScreen />;
  return <Shell />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthProvider><Root /></AuthProvider></React.StrictMode>,
);
