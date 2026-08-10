import 'reflect-metadata';
import { DataSource } from 'typeorm';

export function assertDatabaseUrlConfigured(): void {
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (TEST_DATABASE_URL in test environments); discrete database variables are not supported');
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
});
