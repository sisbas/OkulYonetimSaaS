import { Injectable } from '@nestjs/common';
import { DispatchOutcome } from './notification-dispatch-receipt.entity';

/**
 * #266 N2/N3 — Test-only SIMULATED provider.
 *
 * Sözleşme (MASTER PROMPT §3/§7):
 * - `REAL_EXTERNAL_DELIVERY=OFF`: gerçek sağlayıcı kodu YOKTUR; "provider"
 *   bu simulator'ün ta kendisidir. Sağlayıcı etkisi = receipt satırının
 *   yazılması (o da yalnız transaction başarıyla kapanırsa kalıcı olur).
 * - Enjeksiyon YALNIZCA ortam değişkeniyle (`NOTIFICATION_SIMULATOR_MODE`);
 *   üretimde başarısızlık/enjeksiyon endpoint'i YOKTUR (API ile ayarlanamaz,
 *   tek seferlik API çağrısıyla değiştirilemez).
 * - Modlar boot'da bir kez okunur (fail-closed): bilinmeyen değer uygulamanın
 *   başlamasını engeller.
 * - `NOTIFICATION_SIMULATOR_MODE=accept` (varsayılan) her denemeyi kabul eder.
 *   Reddedilen sonuçlar dahili test kapsamındadır (scenarios 4/5/9/10).
 *
 * Bozucu (destructive) değildir: dış sisteme yazılmaz, ağ çağrısı yapmaz.
 */
export type SimulatorMode = 'accept' | 'reject' | 'uncertain' | `fail_first:${number}`;

export type SimulateInput = Readonly<{
  outboxId: string;
  attempt: number;
  eventType: string;
  channel: string;
}>;

export type SimulateResult = Readonly<{
  outcome: DispatchOutcome;
  mode: SimulatorMode;
  providerRef: string;
  errorCode: string | null;
}>;

const ENV_KEY = 'NOTIFICATION_SIMULATOR_MODE';

function parseMode(raw: string | undefined): SimulatorMode {
  const value = (raw ?? 'accept').trim().toLowerCase();
  if (value === 'accept' || value === 'reject' || value === 'uncertain') {
    return value;
  }
  const match = /^fail_first:(\d{1,3})$/.exec(value);
  if (match) {
    return `fail_first:${Number(match[1])}` as `fail_first:${number}`;
  }
  throw new Error(
    `Invalid ${ENV_KEY}="${raw}" — expected accept | reject | fail_first:<n> | uncertain`,
  );
}

@Injectable()
export class NotificationSimulatorService {
  readonly mode: SimulatorMode;

  constructor() {
    this.mode = parseMode(process.env[ENV_KEY]);
  }

  /**
   * Tek deneme için simüle sağlayıcı sonucu (saf fonksiyon — yan etki yok).
   *
   * `fail_first:N` → ilk N deneme reddedilir, sonrası kabul edilir.
   * Provider ref deterministiktir (`sim:<outboxId>:<attempt>`) ki tekrar
   * okumalarda kanıt aynı kalsın.
   */
  simulate(input: SimulateInput): SimulateResult {
    const outcome = this.outcomeFor(input.attempt);
    return {
      outcome,
      mode: this.mode,
      providerRef: `sim:${input.outboxId}:${input.attempt}`,
      errorCode: outcome === 'provider_rejected' ? 'SIMULATED_REJECTION' : null,
    };
  }

  private outcomeFor(attempt: number): DispatchOutcome {
    if (this.mode === 'accept') return 'provider_accepted';
    if (this.mode === 'reject') return 'provider_rejected';
    if (this.mode === 'uncertain') return 'uncertain';
    const failFirst = Number(this.mode.split(':')[1]);
    return attempt <= failFirst ? 'provider_rejected' : 'provider_accepted';
  }
}
