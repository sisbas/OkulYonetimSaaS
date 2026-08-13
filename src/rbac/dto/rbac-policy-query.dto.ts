import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
   */
  @IsOptional()
  @IsString()
  targetTenantId?: string;
}
