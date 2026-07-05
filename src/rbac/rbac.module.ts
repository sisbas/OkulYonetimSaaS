import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
@Module({ controllers: [RbacController] })
export class RbacModule {}
