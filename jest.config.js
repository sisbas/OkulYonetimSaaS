/**
 * Jest yapılandırması
 *
 * OKUL-10 (Migration/CI Coverage Strategy) kapsamında `coverageThreshold` eklendi.
 * Amaç: CI'da test kapsamının sessizce gerilemesini (coverage regression) fail-closed
 * olarak engellemek.
 *
 * Eşikler, ölçülen mevcut taban değerlerin altında güvenli bir marjla belirlenmiştir;
 * böylece eşik hem anlamlı bir alt sınır olur hem de küçük refactor'larda yanlış
 * pozitif üretmez:
 *
 *   Metrik        Ölçülen (taban)   Eşik
 *   ------------  ---------------   ----
 *   statements    %74.46            %60
 *   branches      %65.35            %50
 *   functions     %65.04            %60
 *   lines         %75.58            %60
 *
 * Yeni modül eklerken bu eşiklerin altına düşülürse `npx jest --coverage` hata verir.
 * Eşiği düşürmek yerine eksik testleri yazmak beklenir.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.worktrees/'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // OKUL-10: coverage regression koruması (global alt sınır)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
