import type { OperationsModule } from './operations.routes';

export type OperationsApiDependency = {
  module: OperationsModule;
  contractStatus: 'not_approved';
  bindingStatus: 'blocked';
  expectedCapabilities: readonly string[];
  requiredContractArtifacts: readonly string[];
  sensitiveDataBoundary: readonly string[];
  runtimeEndpointAssumption: false;
};

export const OPERATIONS_UI_BINDING_GATES = [
  'API contract approved',
  'Permission Catalog role mapping approved',
  '403 error reason contract approved',
  'tenant and own-scope behavior documented',
  'sensitive field response policy approved',
  'loading empty error and forbidden states verified',
  'TypeScript build and relevant tests pass',
] as const;

const COMMON_CONTRACT_ARTIFACTS = [
  'request and response DTO',
  'validation rules',
  'tenant scope behavior',
  'role and own-scope behavior',
  '403 reason mapping',
  'audit requirement',
  'error response format',
] as const;

const COMMON_SENSITIVE_BOUNDARY = [
  'student identity excluded until attendance contract approval',
  'parent and guardian contact excluded',
  'notification payload excluded',
  'counseling note excluded',
  'token and credential excluded',
] as const;

export const OPERATIONS_API_DEPENDENCIES: readonly OperationsApiDependency[] = [
  {
    module: 'daily_operation',
    contractStatus: 'not_approved',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'read daily operational summary',
      'read teacher own daily summary',
      'read leave impact summary',
      'read missing attendance summary',
      'close operational day',
    ],
    requiredContractArtifacts: COMMON_CONTRACT_ARTIFACTS,
    sensitiveDataBoundary: COMMON_SENSITIVE_BOUNDARY,
    runtimeEndpointAssumption: false,
  },
  {
    module: 'schedule',
    contractStatus: 'not_approved',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'read published schedule',
      'read teacher own schedule',
      'read draft schedule',
      'validate draft schedule',
      'publish schedule',
      'read conflict summary',
    ],
    requiredContractArtifacts: [
      ...COMMON_CONTRACT_ARTIFACTS,
      'Course Room and TimeSlot reference contract',
      'schedule lifecycle and publish rules',
    ],
    sensitiveDataBoundary: COMMON_SENSITIVE_BOUNDARY,
    runtimeEndpointAssumption: false,
  },
  {
    module: 'attendance',
    contractStatus: 'not_approved',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'read attendance sessions',
      'read teacher own attendance sessions',
      'read one attendance session',
      'submit own attendance',
      'read missing attendance summary',
    ],
    requiredContractArtifacts: [
      ...COMMON_CONTRACT_ARTIFACTS,
      'attendance session lifecycle',
      'record lock and update rules',
      'student roster minimum-field policy',
    ],
    sensitiveDataBoundary: [
      ...COMMON_SENSITIVE_BOUNDARY,
      'student roster remains blocked until minimum-field policy approval',
      'absence notification data remains outside this binding slice',
    ],
    runtimeEndpointAssumption: false,
  },
] as const;
