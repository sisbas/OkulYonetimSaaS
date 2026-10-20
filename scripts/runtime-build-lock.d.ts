/**
 * Prosesler-arası mutuel kilit: runtime asset build'i ile dist/runtime
 * okumasını serileştirir (eşzamanlı jest işçileri flake fix, #445).
 */
export function withRuntimeBuildLock<T>(fn: () => T): T;
