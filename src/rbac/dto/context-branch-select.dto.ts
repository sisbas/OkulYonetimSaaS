import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Şube seçimi isteği (#339 R4).
 *
 * Gövde şube adını ve isteğe bağlı okunabilir şube kodunu taşır: tenant/rol/izin gibi yetki beyanları bu
 * DTO'da yoktur ve global `ValidationPipe({ forbidNonWhitelisted: true })`
 * sayesinde ek alan gönderilmesi 400 ile reddedilir (istemci beyanı yetki
 * üretmez).
 */
export class ContextBranchSelectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  branchName!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  branchCode?: string;
}
