import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * OKUL-01 policy engine değerlendirme isteği DTO'su.
 * Controller üzerinden gelen sorguları doğrular (class-validator).
 */
export class RbacPolicyQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  permission: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  resource: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  action?: string;

  /**
   * Erişilmek istenen kaynağın tenant kimliği. Belirtilirse tenant izolasyonu
   * kontrolü yapılır; belirtilmezse sadece aktör izinleri değerlendirilir.
   * UUID formatında olmalıdır (tenant ID sözleşmesi).
   */
  @IsOptional()
  @IsUUID('4', { message: 'targetTenantId geçerli bir UUID olmalıdır' })
  targetTenantId?: string;

  /**
   * Erişilmek istenen öğrenci kaydının kimliği (opsiyonel).
   * Veli (parent) sahiplik kontrolü için kullanılır. KVKK: yalnızca ID, PII yok.
   * @IsUUID ile doğrulanır (öğrenci kaydı kimliği sözleşmesi).
   */
  @IsOptional()
  @IsUUID('4', { message: 'targetStudentId geçerli bir UUID olmalıdır' })
  targetStudentId?: string;
}
