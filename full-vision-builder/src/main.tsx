import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Menu,
  PlayCircle,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import './styles.css';

// HERO: the operational command rail makes the dashboard feel like a live school control room.
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'phase1' | 'phase2' | 'phase3';
type IconType = LucideIcon;

const nav: Array<{ label: string; icon: IconType; active?: boolean }> = [
  { label: 'Genel Bakış', icon: LayoutDashboard, active: true },
  { label: 'Günlük Operasyon', icon: CalendarDays },
  { label: 'İzin Merkezi', icon: Clock3 },
  { label: 'Program Stüdyosu', icon: BarChart3 },
  { label: 'Yoklama', icon: Users },
  { label: 'Veli Bilgilendirme', icon: Bell },
];

const metrics = [
  { label: 'Bugünkü ders', value: '42', helper: '38 planlı', tone: 'phase1' as const, delta: '+4 ek oturum' },
  { label: 'İzin etkisi', value: '3', helper: '1 kritik', tone: 'warning' as const, delta: '2 aday hazır' },
  { label: 'Yoklama', value: '%86', helper: '6 bekliyor', tone: 'warning' as const, delta: '18 dk gecikme' },
  { label: 'Veli bildirimi', value: '18', helper: '16 hazır', tone: 'success' as const, delta: '2 insan onayı' },
];

const operations = [
  { time: '09:00', title: 'TYT Matematik · 12-SAY1', meta: 'Derslik 2 · Seda Öğretmen', status: 'Tamamlandı', tone: 'success' as const },
  { time: '10:40', title: 'Türkçe · 11-EA1', meta: 'Derslik 5 · Nergiz Öğretmen', status: 'Yoklama bekliyor', tone: 'warning' as const },
  { time: '12:20', title: 'Fizik · Mezun SAY2', meta: 'Derslik 1 · Tuğçe Öğretmen', status: 'İzin etkisi', tone: 'danger' as const },
  { time: '14:00', title: 'Rehberlik · 12-EA2', meta: 'Görüşme Odası · Filiz Öğretmen', status: 'Planlandı', tone: 'neutral' as const },
];

const alerts = [
  {
    icon: AlertTriangle,
    tone: 'danger' as const,
    title: '12:20 Fizik dersi açıkta',
    detail: 'İzin talebi onay bekliyor. 2 uygun öğretmen bulundu.',
    action: 'İzin etkisini incele',
  },
  {
    icon: Clock3,
    tone: 'warning' as const,
    title: '6 yoklama henüz alınmadı',
    detail: 'İlk gecikme 18 dakika önce oluştu.',
    action: 'Yoklama paneline git',
  },
];

const phases = [
  { badge: 'F1', tone: 'phase1' as const, title: 'Operasyon çekirdeği', label: 'Mevcut / Kanıtlı', count: '8 ekran' },
  { badge: 'F2', tone: 'phase2' as const, title: 'Akademik yönetim', label: 'Planlanan / Etkileşimli Simülasyon', count: '8 ekran' },
  { badge: 'F3', tone: 'phase3' as const, title: 'Yönetim vizyonu', label: 'Vizyon / Kavramsal Simülasyon', count: '5 ekran', note: 'Canlı AI sonucu değildir.' },
];

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function MetricCard({ label, value, helper, tone, delta }: (typeof metrics)[number]) {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span>{label}</span>
        <Badge tone={tone}>{helper}</Badge>
      </div>
      <strong>{value}</strong>
      <small>{delta}</small>
    </article>
  );
}

function StatusRow({ time, title, meta, status, tone }: (typeof operations)[number]) {
  return (
    <div className="status-row">
      <time>{time}</time>
      <div className="status-row__body">
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <Badge tone={tone}>{status}</Badge>
      <ChevronRight size={18} aria-hidden="true" />
    </div>
  );
}

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark"><GraduationCap size={22} aria-hidden="true" /></div>
          <div><strong>Okul Yönetim</strong><span>Full Vision Demo</span></div>
        </div>
        <nav aria-label="Ana menü">
          <p className="nav-label">FAZ 1 · OPERASYON</p>
          {nav.map(({ label, icon: Icon, active }) => (
            <button className={`nav-item ${active ? 'is-active' : ''}`} key={label}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <p className="nav-label nav-label--spaced">VİZYON ALANLARI</p>
          <button className="nav-item"><Sparkles size={18} aria-hidden="true" /><span>Akademik Yönetim</span><Badge tone="phase2">F2</Badge></button>
          <button className="nav-item"><ShieldCheck size={18} aria-hidden="true" /><span>Komuta Merkezi</span><Badge tone="phase3">F3</Badge></button>
        </nav>
        <div className="sidebar__footer"><span>Demo Eğitim Kurumu</span><small>Kampüs A · Sentetik veri</small></div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button mobile-only" aria-label="Menüyü aç"><Menu size={20} aria-hidden="true" /></button>
          <div className="search"><Search size={18} aria-hidden="true" /><span>Ekran, öğrenci veya işlem ara</span></div>
          <div className="topbar__actions">
            <Badge tone="phase1">Faz 1</Badge>
            <Badge tone="success">Mevcut / Kanıtlı</Badge>
            <button className="icon-button" aria-label="Sıfırla"><RefreshCcw size={18} aria-hidden="true" /></button>
            <button className="icon-button" aria-label="Ayarlar"><Settings2 size={18} aria-hidden="true" /></button>
          </div>
        </header>

        <section className="content">
          <div className="command-rail" aria-label="Operasyon özeti">
            <span>22 Temmuz 2026 · Çarşamba</span>
            <strong>Aktif vardiya: 08:30-16:40</strong>
            <Badge tone="warning">1 kritik darboğaz</Badge>
            <Badge tone="neutral">Demo Verisi</Badge>
          </div>

          <div className="page-heading">
            <div>
              <div className="eyebrow">GÜNLÜK OPERASYON</div>
              <h1>Okul operasyon dashboard</h1>
              <p>Program, izin, yoklama ve veli bilgilendirme akışının tek merkezden kontrolü.</p>
            </div>
            <button className="primary-button"><PlayCircle size={18} aria-hidden="true" />Sunum Modunu Başlat</button>
          </div>

          <div className="disclosure">
            <ShieldCheck size={19} aria-hidden="true" />
            <div><strong>Demo Verisi</strong><span>Bu ekrandaki kayıtlar sentetik ve deterministiktir. Gerçek işlem yapılmaz.</span></div>
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
          </div>

          <div className="dashboard-grid">
            <section className="panel panel--wide">
              <div className="panel__header">
                <div><h2>Bugünün akışı</h2><p>Ders ve operasyon durumları</p></div>
                <button className="text-button">Tümünü gör</button>
              </div>
              <div className="status-list">
                {operations.map((operation) => <StatusRow key={`${operation.time}-${operation.title}`} {...operation} />)}
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div><h2>Kritik uyarılar</h2><p>Bugün aksiyon gerektirenler</p></div>
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <div className="alert-list">
                {alerts.map(({ icon: Icon, tone, title, detail, action }) => (
                  <div className={`alert-row alert-row--${tone}`} key={title}>
                    <Icon size={18} aria-hidden="true" />
                    <div><strong>{title}</strong><span>{detail}</span></div>
                    <button>{action}</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel panel--wide">
              <div className="panel__header">
                <div><h2>Operasyon kapanış zinciri</h2><p>Günün dört temel kontrol noktası</p></div>
                <Badge tone="warning">%78 tamamlandı</Badge>
              </div>
              <div className="flow-steps">
                <div className="flow-step is-done"><CheckCircle2 size={21} aria-hidden="true" /><strong>Program</strong><span>42 ders doğrulandı</span></div>
                <div className="flow-line is-done" />
                <div className="flow-step is-warning"><AlertTriangle size={21} aria-hidden="true" /><strong>İzin</strong><span>1 kritik etki</span></div>
                <div className="flow-line" />
                <div className="flow-step"><Clock3 size={21} aria-hidden="true" /><strong>Yoklama</strong><span>6 oturum bekliyor</span></div>
                <div className="flow-line" />
                <div className="flow-step"><Bell size={21} aria-hidden="true" /><strong>Bildirim</strong><span>2 onay bekliyor</span></div>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header"><div><h2>Faz görünümü</h2><p>Ürün olgunluğu</p></div></div>
              <div className="phase-list">
                {phases.map((phase) => (
                  <div key={phase.badge}>
                    <Badge tone={phase.tone}>{phase.badge}</Badge>
                    <span><strong>{phase.title}</strong><small>{phase.label}</small>{phase.note && <em>{phase.note}</em>}</span>
                    <b>{phase.count}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
