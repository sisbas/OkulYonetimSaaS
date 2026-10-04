import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentContact } from './parent-contact.entity';
import { ContactPoint } from './contact-point.entity';
import { StudentParentContact } from './student-parent-contact.entity';
import { ParentContactRepository } from './parent-contact.repository';

/**
 * #266 N1a — Parent contact / contact point / student-link
 * encrypted foundation module.
 *
 * KVKK encrypted domain storage: ham contact değerleri yalnız
 * AES-256-GCM envelope'ı olarak `contact_points.encrypted_value`'da
 * tutulur; public read yalnız masked/minimized projeksiyon
 * döndürür. Raw decryption yalnız yetkili actor ve
 * purpose-bound AAD doğrulamasıyla yapılır (N1 public
 * raw-contact read endpoint YOKTUR).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParentContact,
      ContactPoint,
      StudentParentContact,
    ]),
  ],
  providers: [ParentContactRepository],
  exports: [ParentContactRepository],
})
export class ParentsModule {}
