import React from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, GraduationCap, LayoutDashboard, Menu, RefreshCcw, Search, Settings2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import './styles.css';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'phase1' | 'phase2' | 'phase3';

const nav = [
  { label: 'Genel Bakış', icon: LayoutDashboard, active: true },
  { label: 'Günlük Operasyon', icon: CalendarDays },
  { label: 'İzin Merkezi', icon: Clock3 },
  { label: 'Program Stüdyosu', icon: BarChart3 },
  { label: 'Yoklama', icon: Users },
  { label: 'Veli Bilgilendirme', icon: Bell },
];

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function MetricCard({ label, value, helper, tone = 'neutral' }: { label: string; value: string; helper: string; tone?: Tone }) {
  return <article className="metric-card">
    <div className="metric-card__top"><span>{label}</span><Badge tone={tone}>{helper}</Badge></div>
    <strong>{value}</strong>
  </article>;
}

function StatusRow({ time, title, meta, status, tone }: { time: string; title: string; meta: string; status: string; tone: Tone }) {
  return <div className="status-row">
    <time>{time}</time>
    <div className="status-row__body"><strong>{title}</strong><span>{meta}</span></div>
    <Badge tone={tone}>{status}</Badge>
    <ChevronRight size={18} aria-hidden="true" />
  </div>;
}

function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand__mark"><GraduationCap size={22} /></div><div><strong>Okul Yönetim</strong><span>Full Vision Demo</span></div></div>
      <nav aria-label="Ana menü">
        <p className="nav-label">FAZ 1 · OPERASYON</p>
        {nav.map(({ label, icon: Icon, active }) => <button className={`nav-item ${active ? 'is-active' : ''}`} key={label}><Icon size={18}/><span>{label}</span></button>)}
        <p className="nav-label nav-label--spaced">VİZYON ALANLARI</p>
        <button className="nav-item"><Sparkles size={18}/><span>Akademik Yönetim</span><Badge tone="phase2">F2</Badge></button>
        <button className="nav-item"><ShieldCheck size={18}/><span>Komuta Merkezi</span><Badge tone="phase3">F3</Badge></button>
      </nav>
      <div className="sidebar__footer"><span>Demo Eğitim Kurumu</span><small>Kampüs A · Sentetik veri</small></div>
    </aside>

    <main>
      <header className="topbar">
        <button className="icon-button mobile-only" aria-label="Menüyü aç"><Menu size={20}/></button>
        <div className="search"><Search size={18}/><span>Ekran, öğrenci veya işlem ara</span></div>
        <div className="topbar__actions"><Badge tone="phase1">Faz 1</Badge><Badge tone="success">Mevcut / Kanıtlı</Badge><button className="icon-button" aria-label="Sıfırla"><RefreshCcw size={18}/></button><button className="icon-button" aria-label="Ayarlar"><Settings2 size={18}/></button></div>
      </header>

      <section className="content">
        <div className="page-heading">
          <div><div className="eyebrow">22 Temmuz 2026 · Çarşamba</div><h1>Günlük operasyon görünümü</h1><p>Program, izin, yoklama ve veli bilgilendirme akışının tek merkezden kontrolü.</p></div>
          <button className="primary-button">Sunum Modunu Başlat</button>
        </div>

        <div className="disclosure"><ShieldCheck size={19}/><div><strong>Demo Verisi</strong><span>Bu ekrandaki kayıtlar sentetik ve deterministiktir. Gerçek işlem yapılmaz.</span></div></div>

        <div className="metrics-grid">
          <MetricCard label="Bugünkü ders" value="42" helper="38 planlı" tone="phase1" />
          <MetricCard label="İzin etkisi" value="3" helper="1 kritik" tone="warning" />
          <MetricCard label="Yoklama" value="%86" helper="6 bekliyor" tone="warning" />
          <MetricCard label="Veli bildirimi" value="18" helper="16 hazır" tone="success" />
        </div>

        <div className="dashboard-grid">
          <section className="panel panel--wide">
            <div className="panel__header"><div><h2>Bugünün akışı</h2><p>Ders ve operasyon durumları</p></div><button className="text-button">Tümünü gör</button></div>
            <div className="status-list">
              <StatusRow time="09:00" title="TYT Matematik · 12-SAY1" meta="Derslik 2 · Seda Öğretmen" status="Tamamlandı" tone="success" />
              <StatusRow time="10:40" title="Türkçe · 11-EA1" meta="Derslik 5 · Nergiz Öğretmen" status="Yoklama bekliyor" tone="warning" />
              <StatusRow time="12:20" title="Fizik · Mezun SAY2" meta="Derslik 1 · Tuğçe Öğretmen" status="İzin etkisi" tone="danger" />
              <StatusRow time="14:00" title="Rehberlik · 12-EA2" meta="Görüşme Odası · Filiz Öğretmen" status="Planlandı" tone="neutral" />
            </div>
          </section>

          <section className="panel">
            <div className="panel__header"><div><h2>Kritik uyarılar</h2><p>Bugün aksiyon gerektirenler</p></div><AlertTriangle size={20}/></div>
            <div className="alert-card alert-card--danger"><div className="alert-card__icon"><AlertTriangle size={18}/></div><div><strong>12:20 Fizik dersi açıkta</strong><span>İzin talebi onay bekliyor. 2 uygun öğretmen bulundu.</span><button>İzin etkisini incele</button></div></div>
            <div className="alert-card"><div className="alert-card__icon"><Clock3 size={18}/></div><div><strong>6 yoklama henüz alınmadı</strong><span>İlk gecikme 18 dakika önce oluştu.</span><button>Yoklama paneline git</button></div></div>
          </section>

          <section className="panel panel--wide">
            <div className="panel__header"><div><h2>Operasyon kapanış zinciri</h2><p>Günün dört temel kontrol noktası</p></div><Badge tone="warning">%78 tamamlandı</Badge></div>
            <div className="flow-steps">
              <div className="flow-step is-done"><CheckCircle2 size={21}/><strong>Program</strong><span>42 ders doğrulandı</span></div>
              <div className="flow-line is-done" />
              <div className="flow-step is-warning"><AlertTriangle size={21}/><strong>İzin</strong><span>1 kritik etki</span></div>
              <div className="flow-line" />
              <div className="flow-step"><Clock3 size={21}/><strong>Yoklama</strong><span>6 oturum bekliyor</span></div>
              <div className="flow-line" />
              <div className="flow-step"><Bell size={21}/><strong>Bildirim</strong><span>2 onay bekliyor</span></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header"><div><h2>Faz görünümü</h2><p>Ürün olgunluğu</p></div></div>
            <div className="phase-list">
              <div><Badge tone="phase1">F1</Badge><span><strong>Operasyon çekirdeği</strong><small>Mevcut / Kanıtlı</small></span><b>8 ekran</b></div>
              <div><Badge tone="phase2">F2</Badge><span><strong>Akademik yönetim</strong><small>Etkileşimli simülasyon</small></span><b>8 ekran</b></div>
              <div><Badge tone="phase3">F3</Badge><span><strong>Yönetim vizyonu</strong><small>Kavramsal simülasyon</small></span><b>5 ekran</b></div>
            </div>
          </section>
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
