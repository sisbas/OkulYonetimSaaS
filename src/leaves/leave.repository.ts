import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveDecisionStatus, LeaveRequest } from './leave-request.entity';

export type CreateLeaveRequestValues = Pick<
  LeaveRequest,
  'tenantId' | 'branchId' | 'teacherId' | 'requesterUserId' | 'durationType' | 'reasonCode' | 'coverageStatus' | 'startsAt' | 'endsAt'
>;

export type LeaveDecisionValues = {
  decision: LeaveDecisionStatus.APPROVED | LeaveDecisionStatus.REJECTED;
  decidedByUserId: string;
  expectedVersion: number;
};

@Injectable()
export class LeaveRepository {
  constructor(
    @InjectRepository(LeaveRequest) private readonly repository: Repository<LeaveRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async create(ctx: RequestContext, values: CreateLeaveRequestValues): Promise<LeaveRequest> {
    assertTenantScope(ctx, 'leave_requests');
    return this.dataSource.transaction(async (manager) => {
      const request = manager.create(LeaveRequest, values);
      const saved = await manager.save(LeaveRequest, request);
      await this.insertAudit(manager, ctx, 'leave.request_created', saved, 'created');
      await this.insertOutbox(manager, 'leave.request_created', saved);
      return saved;
    });
  }

  async list(ctx: RequestContext, query: ListLeaveRequestsQueryDto): Promise<LeaveRequest[]> {
    assertTenantScope(ctx, 'leave_requests');
    const qb = this.repository.createQueryBuilder('leave')
      .where('leave.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('leave.branch_id = :branchId', { branchId: query.branchId });

    if (query.teacherId) qb.andWhere('leave.teacher_id = :teacherId', { teacherId: query.teacherId });
    if (query.decisionStatus) qb.andWhere('leave.decision_status = :decisionStatus', { decisionStatus: query.decisionStatus });
    if (query.from) qb.andWhere('leave.ends_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('leave.starts_at <= :to', { to: query.to });

    return qb.orderBy('leave.starts_at', 'ASC').addOrderBy('leave.created_at', 'ASC').getMany();
  }

  async findTenantScoped(ctx: RequestContext, id: string): Promise<LeaveRequest | null> {
    assertTenantScope(ctx, 'leave_requests');
    return this.repository.findOne({ where: { id, tenantId: ctx.tenantId } });
  }

  async findOwn(ctx: RequestContext, id: string, teacherId: string): Promise<LeaveRequest | null> {
    assertTenantScope(ctx, 'leave_requests');
    return this.repository.findOne({ where: { id, tenantId: ctx.tenantId, teacherId } });
  }

  async decide(ctx: RequestContext, id: string, values: LeaveDecisionValues): Promise<LeaveRequest | null> {
    assertTenantScope(ctx, 'leave_requests');
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(LeaveRequest, {
        where: { id, tenantId: ctx.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing) return null;
      if (existing.version !== values.expectedVersion) return existing;
      if (existing.decisionStatus !== LeaveDecisionStatus.PENDING) return existing;

      existing.decisionStatus = values.decision;
      existing.decidedByUserId = values.decidedByUserId;
      existing.decidedAt = new Date();
      existing.version += 1;

      const saved = await manager.save(LeaveRequest, existing);
      await this.insertAudit(manager, ctx, `leave.${values.decision}`, saved, values.decision);
      await this.insertOutbox(manager, `leave.${values.decision}`, saved);
      return saved;
    });
  }

  private async insertAudit(manager: EntityManager, ctx: RequestContext, eventName: string, leave: LeaveRequest, result: string): Promise<void> {
    await manager.query(
      `INSERT INTO leave_audit_events
        (tenant_id, leave_request_id, actor_user_id, event_name, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ctx.tenantId,
        leave.id,
        ctx.user?.userId ?? ctx.userId,
        eventName,
        leave.reasonCode,
        {
          schemaVersion: 1,
          result,
          branchId: leave.branchId,
          decisionStatus: leave.decisionStatus,
          coverageStatus: leave.coverageStatus,
          version: leave.version,
        },
      ],
    );
  }

  private async insertOutbox(manager: EntityManager, eventName: string, leave: LeaveRequest): Promise<void> {
    const eventKey = `${eventName}:${leave.id}:v${leave.version}`;
    await manager.query(
      `INSERT INTO leave_outbox_events
        (event_key, tenant_id, leave_request_id, event_name, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        eventKey,
        leave.tenantId,
        leave.id,
        eventName,
        {
          schemaVersion: 1,
          leaveRequestId: leave.id,
          branchId: leave.branchId,
          decisionStatus: leave.decisionStatus,
          coverageStatus: leave.coverageStatus,
          version: leave.version,
        },
      ],
    );
  }
}
