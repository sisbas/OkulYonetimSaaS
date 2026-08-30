import 'reflect-metadata';
import { DataSource } from 'typeorm';

export function getDatabaseUrl(): string | undefined {
  return process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
    : process.env.DATABASE_URL;
}

export function assertDatabaseUrlConfigured(): string {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (TEST_DATABASE_URL is allowed only when NODE_ENV=test); discrete database variables are not supported');
  }
  return databaseUrl;
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: getDatabaseUrl(),
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts'],
});

const initializeAppDataSource = AppDataSource.initialize.bind(AppDataSource);
AppDataSource.initialize = function initializeWithDatabaseUrlAssertion() {
  assertDatabaseUrlConfigured();
  return initializeAppDataSource();
};
