import {
  AcademicProfile,
  ActionCard,
  AlertSummary,
  AttendanceSummary,
  BranchComparison,
  DemoDataBadge,
  ExplainabilityPanel,
  ExploreModulesDrawer,
  GuidanceAction,
  MaturityBadge,
  MetricStrip,
  OperationsTimeline,
  PageValueHeader,
  PresentationStepper,
  ProductValuePanel,
  ProgramImpactPanel,
  SalesAppShell,
  SalesNavigation,
  SubstituteSelection,
  WhatIfComparison,
} from './components';

export const allowedBuilderInputs = [
  'title',
  'subtitle',
  'description',
  'helperText',
  'label',
  'icon',
  'tone',
  'density',
  'layout',
  'emphasis',
  'primaryActionLabel',
] as const;

export const protectedBuilderInputs = [
  'route',
  'routeId',
  'entity',
  'fixture',
  'fixtureId',
  'reducer',
  'scenario',
  'scenarioId',
] as const;

export const builderComponentRegistry = [
  { name: 'SalesAppShell', component: SalesAppShell },
  { name: 'SalesNavigation', component: SalesNavigation },
  { name: 'PresentationStepper', component: PresentationStepper },
  { name: 'DemoDataBadge', component: DemoDataBadge },
  { name: 'MaturityBadge', component: MaturityBadge },
  { name: 'PageValueHeader', component: PageValueHeader },
  { name: 'MetricStrip', component: MetricStrip },
  { name: 'ActionCard', component: ActionCard },
  { name: 'OperationsTimeline', component: OperationsTimeline },
  { name: 'AlertSummary', component: AlertSummary },
  { name: 'ProgramImpactPanel', component: ProgramImpactPanel },
  { name: 'SubstituteSelection', component: SubstituteSelection },
  { name: 'AttendanceSummary', component: AttendanceSummary },
  { name: 'AcademicProfile', component: AcademicProfile },
  { name: 'GuidanceAction', component: GuidanceAction },
  { name: 'BranchComparison', component: BranchComparison },
  { name: 'WhatIfComparison', component: WhatIfComparison },
  { name: 'ExplainabilityPanel', component: ExplainabilityPanel },
  { name: 'ProductValuePanel', component: ProductValuePanel },
  { name: 'ExploreModulesDrawer', component: ExploreModulesDrawer },
] as const;

export type BuilderComponentName = (typeof builderComponentRegistry)[number]['name'];

// This registry is deliberately SDK-agnostic. Builder.io binding must consume this
// manifest without adding route, fixture, reducer or scenario inputs.
