import { useEffect, useMemo, useState } from 'react';
import { Presentation, Route, X } from 'lucide-react';
import {
  AcademicProfile,
  AlertSummary,
  AttendanceSummary,
  BranchComparison,
  DemoDataBadge,
  ExplainabilityPanel,
  ExploreModulesDrawer,
  GuidanceAction,
  MaturityBadge,
  MetricStrip,
  MobileMenuButton,
  OperationsTimeline,
  PageValueHeader,
  PresentationStepper,
  ProductValuePanel,
  ProgramImpactPanel,
  SalesAppShell,
  SalesNavigation,
  SubstituteSelection,
  WhatIfComparison,
  sectionIcons,
  type Metric,
  type SalesNavigationItem,
  type SalesStepId,
  type Tone,
} from './components';

interface StepConfig {
  id: SalesStepId;
  label: string;
  helper: string;
  eyebrow: string;
  title: string;
  description: string;
  problem: string;
  benefit: string;
  maturity: string;
  maturityTone: Tone;
  primaryActionLabel: string;
  presenterNote: string;
  metrics: Metric[];
}

const steps: StepConfig[] = [
  {
    id: 'overview',
    label: 'Yönetici Özeti',
    helper: 'Günün operasyon sağlığı',
    eyebrow: 'Durak 1 · Yönetici Özeti',
    title: 'Operasyonu tek görünümde yönetin',
    description: 'Program, izin, yoklama ve iletişim aksiyonlarını aynı yönetim bağlamında görün.',
    problem: 'Dağınık operasyon sinyalleri yöneticinin gün içinde geç aksiyon almasına neden olur.',
    benefit: 'Tek görünüm, kritik işi ve sorumlu aksiyonu ilk bakışta görünür kılar.',
    maturity: 'Mevcut / Kanıtlı',
    maturityTone: 'success',
    primaryActionLabel: 'Operasyonu incele',
    presenterNote: 'Günlük operasyonun bütününü tek ekranda konumlandırın.',
    metrics: [
      { label: 'Bugünkü ders', value: '42', helper: '38 planlı', tone: 'phase1' },
      { label: 'Kritik aksiyon', value: '3', helper: '1 açık ders', tone: 'danger' },
      { label: 'Yoklama', value: '%86', helper: '6 bekliyor', tone: 'warning' },
      { label: 'Veli bildirimi', value: '18', helper: '16 hazır', tone: 'success' },
    ],
  },
  {
    id: 'operations',
    label: 'Günlük Operasyon',
    helper: 'Riskleri sorun oluşmadan görün',
    eyebrow: 'Durak 2 · Günlük Operasyon',
    title: 'Günün risklerini erken görün',
    description: 'Ders, yoklama, izin ve bildirim aksiyonlarını zaman sırasıyla takip edin.',
    problem: 'Eksik yoklama ve izin etkisi farklı ekranlarda kaldığında operasyon zinciri kopar.',
    benefit: 'Zaman sıralı görünüm, yöneticinin hangi işi önce kapatacağını netleştirir.',
    maturity: 'Mevcut / Kanıtlı',
    maturityTone: 'success',
    primaryActionLabel: 'İzin etkisini çöz',
    presenterNote: 'Kritik izin etkisine geçmeden önce açık aksiyonları gösterin.',
    metrics: [
      { label: 'Açık aksiyon', value: '3', helper: '1 kritik', tone: 'danger' },
      { label: 'İzin etkisi', value: '2', helper: '1 açık', tone: 'warning' },
      { label: 'Eksik yoklama', value: '6', helper: '18 dk', tone: 'warning' },
      { label: 'Bekleyen bildirim', value: '2', helper: 'Onay gerekli', tone: 'phase1' },
    ],
  },
  {
    id: 'continuity',
    label: 'Program ve İzin',
    helper: 'Ders sürekliliğini yönetin',
    eyebrow: 'Durak 3 · Program ve İzin Sürekliliği',
    title: 'İzinle programı birlikte yönetin',
    description: 'İzinli öğretmeni, etkilenen dersi ve uygun yedek seçeneğini aynı çalışma yüzeyinde görün.',
    problem: 'İzin kararı ders etkisinden ayrı verildiğinde açık ders ve iletişim riski oluşur.',
    benefit: 'Etki görünümü, karar anında ders sürekliliğini ve açık kalan işi gösterir.',
    maturity: 'Mevcut / Kanıtlı',
    maturityTone: 'success',
    primaryActionLabel: 'Program etkisini gör',
    presenterNote: 'İzin onayı ile ders kapsamasının ayrı durumlar olduğunu vurgulayın.',
    metrics: [
      { label: 'İzinli öğretmen', value: '1', helper: 'Saatlik izin', tone: 'warning' },
      { label: 'Etkilenen ders', value: '2', helper: 'Bugün', tone: 'danger' },
      { label: 'Uygun yedek', value: '2', helper: 'Hazır karşılaştırma', tone: 'success' },
      { label: 'Açık kalan ders', value: '1', helper: 'Aksiyon gerekli', tone: 'danger' },
    ],
  },
  {
    id: 'academic',
    label: 'Akademik Gelişim',
    helper: 'Veriyi takip aksiyonuna çevirin',
    eyebrow: 'Durak 4 · Akademik Gelişim',
    title: 'Veriyi gelişim planına dönüştürün',
    description: 'Sınav, devamsızlık ve rehberlik sinyallerini tek öğrenci profilinde birleştirin.',
    problem: 'Akademik veri takip aksiyonuna bağlanmadığında rapor görünür fakat süreç ilerlemez.',
    benefit: 'Birleşik profil, rehberlik ekibinin somut ve izlenebilir takip planı kurmasını sağlar.',
    maturity: 'Planlanan / Etkileşimli Simülasyon',
    maturityTone: 'phase2',
    primaryActionLabel: 'Gelişim planını gör',
    presenterNote: 'Akademik verinin otomatik karar değil, takip planı girdisi olduğunu belirtin.',
    metrics: [
      { label: 'Son TYT neti', value: '71,5', helper: '+8,2 gelişim', tone: 'success' },
      { label: 'Devamsızlık', value: '4 gün', helper: '30 günlük', tone: 'warning' },
      { label: 'Açık aksiyon', value: '3', helper: 'Rehberlik', tone: 'phase2' },
      { label: 'Son görüşme', value: '8 gün', helper: 'Takip açık', tone: 'neutral' },
    ],
  },
  {
    id: 'vision',
    label: 'Akıllı Yönetim Vizyonu',
    helper: 'Hazır senaryoları karşılaştırın',
    eyebrow: 'Durak 5 · Akıllı Yönetim Vizyonu',
    title: 'Senaryoları açıklanabilir biçimde karşılaştırın',
    description: 'Şube farklarını, hazır what-if seçeneklerini ve öneri gerekçelerini birlikte değerlendirin.',
    problem: 'Çok şubeli kararlar görünür gerekçe olmadan yalnız sezgiye dayanabilir.',
    benefit: 'Hazır karşılaştırma, yöneticiye seçenekleri ve etkilerini aynı karar çerçevesinde sunar.',
    maturity: 'Vizyon / Kavramsal Simülasyon',
    maturityTone: 'phase3',
    primaryActionLabel: 'Senaryoyu karşılaştır',
    presenterNote: 'Bu yüzeyin canlı AI değil, hazırlanmış kavramsal simülasyon olduğunu açıkça söyleyin.',
    metrics: [
      { label: 'Karşılaştırılan şube', value: '3', helper: 'Hazır veri', tone: 'phase3' },
      { label: 'Senaryo seçeneği', value: '2', helper: 'A / B', tone: 'phase3' },
      { label: 'Açık aksiyon', value: '3 → 1', helper: 'Simülasyon', tone: 'success' },
      { label: 'Açıklama nedeni', value: '3', helper: 'Görünür', tone: 'phase1' },
    ],
  },
];

const navigationItems: SalesNavigationItem[] = steps.map(({ id, label, helper }) => ({ id, label, helper }));

function Topbar({
  activeStep,
  onExplore,
  onPresentation,
  onMobileMenu,
}: {
  activeStep: StepConfig;
  onExplore: () => void;
  onPresentation: () => void;
  onMobileMenu: () => void;
}) {
  const Icon = sectionIcons[activeStep.id];
  return (
    <header className="topbar">
      <div className="topbar__context">
        <MobileMenuButton onClick={onMobileMenu} />
        <span className="context-icon"><Icon size={18} /></span>
        <div><strong>{activeStep.label}</strong><small>Satış Modu · 24 Temmuz 2026</small></div>
      </div>
      <div className="topbar__actions">
        <DemoDataBadge />
        <MaturityBadge tone={activeStep.maturityTone}>{activeStep.maturity}</MaturityBadge>
        <button type="button" className="secondary-button topbar-action" onClick={onExplore}><Route size={16} />Tüm Modüller</button>
        <button type="button" className="secondary-button topbar-action" onClick={onPresentation}><Presentation size={16} />Sunum Modu</button>
      </div>
    </header>
  );
}

function ProblemBenefit({ problem, benefit }: { problem: string; benefit: string }) {
  return (
    <section className="problem-benefit" aria-label="Problem ve kurum faydası">
      <div><span>Problem</span><p>{problem}</p></div>
      <div><span>Kurum faydası</span><p>{benefit}</p></div>
    </section>
  );
}

function ScreenContent({
  activeId,
  onSelect,
}: {
  activeId: SalesStepId;
  onSelect: (id: SalesStepId) => void;
}) {
  if (activeId === 'overview') {
    return (
      <>
        <div className="workspace-grid">
          <OperationsTimeline />
          <AlertSummary onOpenContinuity={() => onSelect('continuity')} onOpenAttendance={() => onSelect('operations')} />
        </div>
        <ProductValuePanel />
      </>
    );
  }

  if (activeId === 'operations') {
    return (
      <div className="workspace-grid">
        <OperationsTimeline />
        <div className="support-stack">
          <AlertSummary onOpenContinuity={() => onSelect('continuity')} onOpenAttendance={() => onSelect('operations')} />
          <AttendanceSummary />
        </div>
      </div>
    );
  }

  if (activeId === 'continuity') {
    return (
      <div className="workspace-grid">
        <ProgramImpactPanel />
        <SubstituteSelection />
      </div>
    );
  }

  if (activeId === 'academic') {
    return (
      <div className="workspace-grid">
        <AcademicProfile />
        <GuidanceAction />
      </div>
    );
  }

  return (
    <div className="vision-stack">
      <div className="workspace-grid">
        <WhatIfComparison />
        <ExplainabilityPanel />
      </div>
      <BranchComparison />
    </div>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState<SalesStepId>('overview');
  const [exploreOpen, setExploreOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);

  const activeIndex = steps.findIndex((step) => step.id === activeId);
  const activeStep = useMemo(() => steps[activeIndex] ?? steps[0], [activeIndex]);

  const selectStep = (id: SalesStepId) => {
    setActiveId(id);
    setMobileNavigationOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextStep = () => selectStep(steps[(activeIndex + 1) % steps.length].id);
  const previousStep = () => selectStep(steps[(activeIndex - 1 + steps.length) % steps.length].id);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExploreOpen(false);
      setMobileNavigationOpen(false);
      if (presentationMode) setPresentationMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [presentationMode]);

  useEffect(() => {
    document.body.style.overflow = exploreOpen || mobileNavigationOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [exploreOpen, mobileNavigationOpen]);

  const primaryAction = activeId === 'vision' ? () => setExploreOpen(true) : nextStep;

  return (
    <div className={presentationMode ? 'presentation-mode' : undefined}>
      <SalesAppShell
        navigation={<SalesNavigation items={navigationItems} activeId={activeId} onSelect={selectStep} onExplore={() => setExploreOpen(true)} />}
        topbar={<Topbar activeStep={activeStep} onExplore={() => setExploreOpen(true)} onPresentation={() => setPresentationMode(true)} onMobileMenu={() => setMobileNavigationOpen(true)} />}
        mobileNavigation={<SalesNavigation compact items={navigationItems} activeId={activeId} onSelect={selectStep} onExplore={() => setExploreOpen(true)} />}
      >
        {presentationMode && (
          <PresentationStepper
            current={activeIndex + 1}
            total={steps.length}
            title={activeStep.label}
            note={activeStep.presenterNote}
            onPrevious={previousStep}
            onNext={nextStep}
            onExit={() => setPresentationMode(false)}
          />
        )}

        <section className="content">
          <PageValueHeader
            eyebrow={activeStep.eyebrow}
            title={activeStep.title}
            description={activeStep.description}
            maturity={activeStep.maturity}
            maturityTone={activeStep.maturityTone}
            primaryActionLabel={activeStep.primaryActionLabel}
            onPrimaryAction={primaryAction}
            secondaryActionLabel={presentationMode ? undefined : 'Sunum Modu'}
            onSecondaryAction={presentationMode ? undefined : () => setPresentationMode(true)}
          />
          <ProblemBenefit problem={activeStep.problem} benefit={activeStep.benefit} />
          <MetricStrip metrics={activeStep.metrics} />
          <ScreenContent activeId={activeId} onSelect={selectStep} />
        </section>
      </SalesAppShell>

      <ExploreModulesDrawer open={exploreOpen} onClose={() => setExploreOpen(false)} />

      {mobileNavigationOpen && (
        <div className="drawer-layer drawer-layer--mobile" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMobileNavigationOpen(false)}>
          <aside className="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Satış adımları">
            <header>
              <div><span>Satış Modu</span><h2>Anlatı Durakları</h2></div>
              <button type="button" className="icon-button" onClick={() => setMobileNavigationOpen(false)} aria-label="Menüyü kapat"><X size={19} /></button>
            </header>
            <SalesNavigation items={navigationItems} activeId={activeId} onSelect={selectStep} onExplore={() => { setMobileNavigationOpen(false); setExploreOpen(true); }} />
          </aside>
        </div>
      )}
    </div>
  );
}
