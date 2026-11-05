import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const controller = readFileSync(join(process.cwd(), 'src', 'leaves', 'leave.controller.ts'), 'utf8');
const service = readFileSync(join(process.cwd(), 'src', 'leaves', 'leave.service.ts'), 'utf8');
const repository = readFileSync(join(process.cwd(), 'src', 'leaves', 'leave.repository.ts'), 'utf8');
const createDto = readFileSync(
  join(process.cwd(), 'src', 'leaves', 'dto', 'create-leave-request.dto.ts'),
  'utf8',
);
const ownQueryDto = readFileSync(
  join(process.cwd(), 'src', 'leaves', 'dto', 'list-own-leave-requests-query.dto.ts'),
  'utf8',
);
const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
const evidenceScript = readFileSync(join(process.cwd(), 'scripts', 'qa-p0-browser-e2e.js'), 'utf8');
const contractDoc = readFileSync(join(process.cwd(), 'docs', 'leaves', 'leave-runtime-contract.md'), 'utf8');

/**
 * #263 P1B-07 — manager approval, impact ve coverage iş akışının sözleşmesi.
 *
 * Bu testler kaynak düzeyinde regresyon kapısıdır: yeni bir "kolaylaştırma"
 * (istemciden teacherId almak, kanıt script'inde doğrudan SQL ile approved izin
 * yazmak, pencere doğrulamasını atlamak) burada durur.
 */
describe('leave ops contract (#263)', () => {
  it('exposes the teacher own history surface with own-scope permission', () => {
    expect(controller).toMatch(/@Get\('me'\)\s+@Permissions\('leave:own:read'\)/);
    // `me` route'u `me/:id` route'undan ÖNCE kayıtlı olmalı; aksi hâlde
    // "me" bir id gibi ele alınır ve 400 döner.
    expect(controller.indexOf("@Get('me')")).toBeLessThan(controller.indexOf("@Get('me/:id')"));
    expect(service).toContain('async listOwn(');
    expect(repository).toContain('async listOwn(');
    expect(repository).toContain('leave.teacher_id = :teacherId');
  });

  it('keeps the on-behalf policy explicit: no client-supplied actor identity', () => {
    // On-behalf adına talep açma YOKTUR; kimlik sunucuda çözülür.
    expect(createDto).not.toContain('teacherId');
    expect(createDto).not.toContain('requesterUserId');
    expect(ownQueryDto).not.toMatch(/^\s*teacherId[?!]?:/m);
    expect(controller).not.toContain('dto.teacherId');
    expect(service).toContain('identity.teacherId');
    // Whitelist dışı alan gönderimi 400 ile reddedilir (sessizce yok sayılmaz).
    expect(main).toContain('forbidNonWhitelisted: true');
  });

  it('validates the leave window in the tenant time zone before any write', () => {
    const validationIndex = service.indexOf('assertLeaveWindow({');
    const writeIndex = service.indexOf('this.leaves.create(');
    expect(validationIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(writeIndex);
    expect(service).toContain('loadTenantTimeZone');
    expect(service).toContain('resolveLeaveTimeZone(timeZone)');
    // İş günü tenant takvim günüdür; UTC'ye düşülmez.
    expect(service).not.toContain('range.startsAt.toISOString().slice(0, 10)');
  });

  it('serializes the overlap check before the overlap select (no TOCTOU double booking)', () => {
    const lockIndex = repository.indexOf('pg_advisory_xact_lock');
    const overlapSelectIndex = repository.indexOf('FROM leave_requests');
    expect(lockIndex).toBeGreaterThan(-1);
    expect(overlapSelectIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(overlapSelectIndex);
  });

  it('never creates approved leave or assignments through direct SQL in the evidence script', () => {
    const sqlInsert = (table: string): RegExp => new RegExp(['INSERT', 'INTO', table].join(' '), 'i');
    expect(evidenceScript).not.toMatch(sqlInsert('leave_requests'));
    expect(evidenceScript).not.toMatch(sqlInsert('leave_substitution_assignments'));
    expect(evidenceScript).not.toMatch(/'approved',\\s*'unresolved'/i);
    // Onay ve talep kamu API'si üzerinden yürür.
    expect(evidenceScript).toContain("'/leaves/me'");
    expect(evidenceScript).toContain('/approve`');
    expect(evidenceScript).toContain('createAndApproveLeaveThroughApi');
  });

  it('documents the window, history and on-behalf policy', () => {
    expect(contractDoc).toContain('GET | `/api/v1/leaves/me`');
    expect(contractDoc).toContain('On-behalf creation is not supported');
    expect(contractDoc).toContain('tenant time zone');
    expect(contractDoc).toContain('advisory lock');
  });
});
