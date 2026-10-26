/**
 * #457 — Güncelleme DTO doğrulaması.
 *
 * `@IsOptional()` class-validator'da null'ı da "alan yok" sayar; bu yüzden
 * `{"targetValue": null}` doğrulamadan geçip NOT NULL kolona ulaşıyor ve 500
 * üretiyordu. Yalnız `undefined` atlanmalı; null 400 olmalı.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStrategicGoalDto } from '../../src/strategic-goals/dto/update-strategic-goal.dto';

async function invalidProperties(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateStrategicGoalDto, payload);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('#457 UpdateStrategicGoalDto null handling', () => {
  it('rejects a null targetValue instead of passing it to the database', async () => {
    expect(await invalidProperties({ targetValue: null })).toContain('targetValue');
  });

  it('still skips fields that are absent', async () => {
    expect(await invalidProperties({ metricLabel: 'Yeni ad' })).toEqual([]);
  });

  it('accepts a numeric targetValue', async () => {
    expect(await invalidProperties({ targetValue: 180 })).toEqual([]);
  });

  it('keeps null meaningful for nullable fields', async () => {
    expect(await invalidProperties({ progressValue: null })).toEqual([]);
    expect(await invalidProperties({ metricLabel: null })).toEqual([]);
  });
});
