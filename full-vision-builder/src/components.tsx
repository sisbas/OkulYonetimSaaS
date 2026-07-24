import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Network,
  Presentation,
  Route,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'phase1' | 'phase2' | 'phase3';
export type SalesStepId = 'overview' | 'operations' | 'continuity' | 'academic' | 'vision';

export interface SalesNavigationItem {
  id: SalesStepId;
  label: string;
  helper: string;
}

export function MaturityBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function DemoDataBadge() {
  return (
    <span className="demo-badge">
      <ShieldCheck size={14} aria-hidden="true" />
      Demo Verisi
    </span>
  );
}

export function SalesNavigation({
  items,
  activeId,
  onSelect,
  onExplore,
  compact = false,
}: {
  items: SalesNavigationItem[];
  activeId: SalesStepId;
  onSelect: (id: SalesStepId) => void;
  onExplore: () => void;
  compact?: boolean;
}) {
  return (
    <nav className={compact ? 'sales-nav sales-nav--compact' : 'sales-nav'} aria-label="Satış anlatısı">
      {!compact && <p className="nav-label">SATIŞ MODU</p>}
      {items.map((item, index) => (
        <button
          type="button"
          className={`sales-nav__item ${item.id === activeId ? 'is-active' : ''}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          aria-current={item.id === activeId ? 'page' : undefined}
        >
          <span className="sales-nav__index">{index + 1}</span>
          <span className="sales-nav__copy">
            <strong>{item.label}</strong>
            {!compact && <small>{item.helper}</small>}
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="sales-nav__item sales-nav__item--explore" onClick={onExplore}>
        <span className="sales-nav__index"><Route size={15} /></span>
        <span className="sales-nav__copy"><strong>Tüm Modüller</strong>{!compact && <small>21 ekran ailesini keşfet</small>}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

export function SalesAppShell({
  navigation,
  topbar,
  children,
  mobileNavigation,
}: {
  navigation: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  mobileNavigation: ReactNode;
}) {
  return (
    <div className="sales-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark"><GraduationCap size={22} /></div>
          <div><strong>Okul Yönetim</strong><span>Full Vision Demo</span></div>
        </div>
        {navigation}
        <div className="sidebar__footer">
          <DemoDataBadge />
          <span>Demo Eğitim Kurumu</span>
          <small>Kampüs A · Sentetik veri</small>
        </div>
      </aside>
      <main className="sales-main">
        {topbar}
        <div className="mobile-stepper">{mobileNavigation}</div>
        {children}
      </main>
    </div>
  );
}

export function PresentationStepper({
  current,
  total,
  title,
  note,
  onPrevious,
  onNext,
  onExit,
}: {
  current: number;
  total: number;
  title: string;
  note: string;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  return (
    <div className="presentation-bar" role="region" aria-label="Sunum Modu">
      <div className="presentation-bar__identity">
        <Presentation size={18} aria-hidden="true" />
        <span>{current}/{total}</span>
        <div><strong>{title}</strong><small>{note}</small></div>
      </div>
      <div className="presentation-bar__actions">
        <DemoDataBadge />
        <button type="button" className="icon-button" onClick={onPrevious} aria-label="Önceki adım"><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" onClick={onNext} aria-label="Sonraki adım"><ChevronRight size={18} /></button>
        <button type="button" className="secondary-button" onClick={onExit}>Sunumdan çık</button>
      </div>
    </div>
  );
}

export function PageValueHeader({
  eyebrow,
  title,
  description,
  maturity,
  maturityTone,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  maturity: string;
  maturityTone: Tone;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <header className="page-value-header">
      <div className="page-value-header__copy">
        <div className="eyebrow">{eyebrow}</div>
        <div className="page-value-header__title-row">
          <h1>{title}</h1>
          <MaturityBadge tone={maturityTone}>{maturity}</MaturityBadge>
        </div>
        <p>{description}</p>
      </div>
      <div className="page-value-header__actions">
        {secondaryActionLabel && onSecondaryAction && (
          <button type="button" className="secondary-button" onClick={onSecondaryAction}>{secondaryActionLabel}</button>
        )}
        <button type="button" className="primary-button" onClick={onPrimaryAction}>
          {primaryActionLabel}<ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export interface Metric {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metric-strip" aria-label="Temel göstergeler">
      {metrics.slice(0, 4).map((metric) => (
        <article className="metric" key={metric.label}>
          <div className="metric__top"><span>{metric.label}</span><MaturityBadge tone={metric.tone}>{metric.helper}</MaturityBadge></div>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}

export function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  tone?: Tone;
}) {
  return (
    <article className={`action-card action-card--${tone}`}>
      <div className="action-card__icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        <button type="button" onClick={onAction}>{actionLabel}<ChevronRight size={15} /></button>
      </div>
    </article>
  );
}

export function OperationsTimeline() {
  const rows = [
    ['09:00', 'TYT Matematik · 12-SAY1', 'Derslik 2 · Tamamlandı', 'Tamamlandı', 'success'],
    ['10:40', 'Türkçe · 11-EA1', 'Derslik 5 · Yoklama bekliyor', 'Aksiyon', 'warning'],
    ['12:20', 'Fizik · Mezun SAY2', 'İzin etkisi · Yedek aranıyor', 'Kritik', 'danger'],
    ['14:00', 'Rehberlik · 12-EA2', 'Görüşme Odası · Planlandı', 'Planlı', 'neutral'],
  ] as const;
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>Bugünün akışı</h2><p>Ders ve operasyon durumları</p></div><CalendarClock size={20} /></div>
      <div className="timeline">
        {rows.map(([time, title, meta, status, tone]) => (
          <div className="timeline__row" key={`${time}-${title}`}>
            <time>{time}</time>
            <span className="timeline__dot" aria-hidden="true" />
            <div><strong>{title}</strong><small>{meta}</small></div>
            <MaturityBadge tone={tone}>{status}</MaturityBadge>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AlertSummary({ onOpenContinuity, onOpenAttendance }: { onOpenContinuity: () => void; onOpenAttendance: () => void }) {
  return (
    <aside className="panel panel--support">
      <div className="panel__header"><div><h2>Kritik aksiyonlar</h2><p>Bugün kapanması gerekenler</p></div><CircleAlert size={20} /></div>
      <div className="action-stack">
        <ActionCard
          icon={<AlertTriangle size={18} />}
          title="12:20 Fizik dersi açıkta"
          description="İzin talebi için iki uygun öğretmen bulundu."
          actionLabel="İzin etkisini çöz"
          onAction={onOpenContinuity}
          tone="danger"
        />
        <ActionCard
          icon={<Clock3 size={18} />}
          title="6 yoklama bekliyor"
          description="İlk gecikme on sekiz dakika önce oluştu."
          actionLabel="Yoklamayı incele"
          onAction={onOpenAttendance}
          tone="warning"
        />
      </div>
    </aside>
  );
}

export function ProgramImpactPanel() {
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>Program etkisi</h2><p>İzin kararıyla etkilenen dersler</p></div><BookOpenCheck size={20} /></div>
      <div className="impact-grid">
        <div><span>İzinli öğretmen</span><strong>Demo Öğretmen A</strong><small>12:00–16:00 · Saatlik izin</small></div>
        <div><span>Etkilenen ders</span><strong>2 ders</strong><small>12-SAY1 ve Mezun SAY2</small></div>
        <div><span>Kapsanan ders</span><strong>1 ders</strong><small>Bir ders hâlâ açık</small></div>
      </div>
      <div className="schedule-preview" aria-label="Program önizlemesi">
        <div className="schedule-preview__time">12:20</div>
        <div className="schedule-preview__lesson"><strong>Fizik · Mezun SAY2</strong><span>Derslik 1</span></div>
        <MaturityBadge tone="danger">Açık ders</MaturityBadge>
      </div>
    </section>
  );
}

export function SubstituteSelection() {
  const teachers = [
    ['Demo Öğretmen B', 'Aynı branş · 2 saat günlük yük', 'Uygun', 'success'],
    ['Demo Öğretmen C', 'Aynı branş · 3 saat günlük yük', 'Alternatif', 'phase1'],
    ['Demo Öğretmen E', 'Aynı saatte dersi var', 'Uygun değil', 'neutral'],
  ] as const;
  return (
    <aside className="panel panel--support">
      <div className="panel__header"><div><h2>Yedek öğretmen</h2><p>Hazır uygunluk karşılaştırması</p></div><UserCheck size={20} /></div>
      <div className="candidate-list">
        {teachers.map(([name, meta, status, tone], index) => (
          <button type="button" className={index === 0 ? 'candidate is-selected' : 'candidate'} key={name}>
            <span className="candidate__avatar">{name.slice(-1)}</span>
            <span><strong>{name}</strong><small>{meta}</small></span>
            <MaturityBadge tone={tone}>{status}</MaturityBadge>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function AttendanceSummary() {
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>Yoklama görünümü</h2><p>Ders kapanış durumları</p></div><Users size={20} /></div>
      <div className="progress-list">
        <div><span><strong>Alınan yoklama</strong><small>36 / 42 oturum</small></span><b>%86</b><i style={{ width: '86%' }} /></div>
        <div><span><strong>Bekleyen bildirim</strong><small>2 veli onayı</small></span><b>2</b><i style={{ width: '34%' }} /></div>
        <div><span><strong>Eksik iletişim</strong><small>Kontrol gerektiriyor</small></span><b>1</b><i style={{ width: '18%' }} /></div>
      </div>
    </section>
  );
}

export function AcademicProfile() {
  return (
    <section className="panel academic-profile">
      <div className="profile-head">
        <div className="profile-avatar">DÖ</div>
        <div><span>Öğrenci profili</span><h2>Demo Öğrenci</h2><p>12. sınıf · Sayısal</p></div>
        <MaturityBadge tone="phase2">Etkileşimli Simülasyon</MaturityBadge>
      </div>
      <div className="profile-metrics">
        <div><span>TYT neti</span><strong>71,5</strong><small>+8,2 son 6 sınav</small></div>
        <div><span>Devamsızlık</span><strong>4 gün</strong><small>Son 30 gün</small></div>
        <div><span>Takip durumu</span><strong>Açık</strong><small>Rehberlik aksiyonu</small></div>
      </div>
      <div className="trend-card">
        <div className="trend-card__copy"><strong>Gelişim eğrisi</strong><span>Düzenli yükseliş, matematik odağı gerekli</span></div>
        <div className="spark-bars" aria-label="Altı sınavlık yükselen performans eğrisi">
          {[42, 49, 53, 61, 66, 72].map((value) => <i key={value} style={{ height: `${value}%` }} />)}
        </div>
      </div>
    </section>
  );
}

export function GuidanceAction() {
  return (
    <aside className="panel panel--support">
      <div className="panel__header"><div><h2>Rehberlik aksiyonu</h2><p>Veriden takip planına</p></div><CheckCircle2 size={20} /></div>
      <div className="guidance-step"><span>1</span><div><strong>Matematik hedefi belirle</strong><small>Haftalık iki odak oturumu</small></div></div>
      <div className="guidance-step"><span>2</span><div><strong>Devamsızlığı izle</strong><small>On dört günlük kontrol</small></div></div>
      <div className="guidance-step"><span>3</span><div><strong>Veli görüşmesi planla</strong><small>Hazır takip notuyla</small></div></div>
    </aside>
  );
}

export function BranchComparison() {
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>Şube karşılaştırması</h2><p>Hazır yönetim görünümü</p></div><Building2 size={20} /></div>
      <div className="comparison-table" role="table" aria-label="Şube karşılaştırması">
        <div role="row" className="comparison-table__head"><span>Şube</span><span>Doluluk</span><span>Yoklama</span><span>Durum</span></div>
        <div role="row"><strong>Kampüs A</strong><span>%88</span><span>%94</span><MaturityBadge tone="success">Dengeli</MaturityBadge></div>
        <div role="row"><strong>Kampüs B</strong><span>%96</span><span>%82</span><MaturityBadge tone="warning">İzle</MaturityBadge></div>
        <div role="row"><strong>Kampüs C</strong><span>%73</span><span>%91</span><MaturityBadge tone="phase1">Kapasite var</MaturityBadge></div>
      </div>
    </section>
  );
}

export function WhatIfComparison() {
  return (
    <section className="panel">
      <div className="panel__header"><div><h2>What-if karşılaştırması</h2><p>Önceden hazırlanmış iki seçenek</p></div><Network size={20} /></div>
      <div className="what-if-grid">
        <article><MaturityBadge tone="neutral">Mevcut</MaturityBadge><h3>Mevcut dağılım</h3><strong>3 açık aksiyon</strong><p>Yoğunluk Kampüs B’de kalıyor.</p></article>
        <article className="is-recommended"><MaturityBadge tone="phase3">Hazır senaryo</MaturityBadge><h3>Dengeleme seçeneği</h3><strong>1 açık aksiyon</strong><p>İki ders Kampüs C kapasitesine taşınıyor.</p></article>
      </div>
    </section>
  );
}

export function ExplainabilityPanel() {
  return (
    <aside className="panel panel--support">
      <div className="panel__header"><div><h2>Öneri açıklaması</h2><p>Kararın dayandığı görünür nedenler</p></div><Sparkles size={20} /></div>
      <ul className="reason-list">
        <li><CheckCircle2 size={16} />Kampüs C’de uygun derslik var.</li>
        <li><CheckCircle2 size={16} />Öğretmen günlük yük sınırı aşılmıyor.</li>
        <li><CheckCircle2 size={16} />İki sınıfın saat penceresi korunuyor.</li>
      </ul>
      <div className="simulation-note"><AlertTriangle size={17} /><span>Canlı AI sonucu değildir. Önceden hazırlanmış kavramsal simülasyondur.</span></div>
    </aside>
  );
}

export function ProductValuePanel() {
  const values = [
    ['Görünürlük', 'Program, izin, yoklama ve iletişim aynı yönetim bağlamında.'],
    ['Koordinasyon', 'Etkilenen ders ve sorumlu aksiyon tek akışta görünür.'],
    ['Karar kalitesi', 'Yönetici, hazır karşılaştırmalarla seçenekleri değerlendirir.'],
  ];
  return (
    <section className="value-panel">
      {values.map(([title, description], index) => (
        <article key={title}>
          <span>{index + 1}</span>
          <div><strong>{title}</strong><p>{description}</p></div>
        </article>
      ))}
    </section>
  );
}

export function ExploreModulesDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const groups = [
    ['Faz 1 · Operasyon', ['Günlük Operasyon', 'Temel Tanımlar', 'Program Stüdyosu', 'İzin Merkezi', 'Yoklama Merkezi', 'Veli Bilgilendirme', 'Temel Raporlar', 'Kullanıcı / Rol / Audit']],
    ['Faz 2 · Akademik', ['Stratejik Dashboard', 'Sınav Yönetimi', 'Performans Analitiği', 'Rehberlik Takibi', 'Öğrenci 360', 'Kaynak ve Yük', 'Veri İçe Aktarma', 'Portal Önizlemesi']],
    ['Faz 3 · Vizyon', ['Yönetim Komuta Merkezi', 'Destek Sinyalleri', 'Senaryo Laboratuvarı', 'Kurum Ağı', 'Entegrasyon Merkezi']],
  ];
  if (!open) return null;
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="explore-drawer" role="dialog" aria-modal="true" aria-labelledby="explore-title">
        <header>
          <div><span>Explore Mode</span><h2 id="explore-title">Tüm Modüller</h2><p>21 ekran ailesi ve teknik keşif alanı.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tüm Modüller panelini kapat"><X size={19} /></button>
        </header>
        <div className="explore-drawer__notice"><DemoDataBadge /><MaturityBadge tone="neutral">Teknik ayrıntılar burada</MaturityBadge></div>
        <div className="module-groups">
          {groups.map(([title, modules]) => (
            <section key={title as string}>
              <h3>{title}</h3>
              <div>
                {(modules as string[]).map((module) => <button type="button" key={module} onClick={onClose}><span>{module}</span><ChevronRight size={16} /></button>)}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="icon-button mobile-menu-button" onClick={onClick} aria-label="Satış adımlarını aç"><Menu size={20} /></button>;
}

export const sectionIcons = {
  overview: LayoutDashboard,
  operations: CalendarClock,
  continuity: BookOpenCheck,
  academic: BarChart3,
  vision: Sparkles,
};
