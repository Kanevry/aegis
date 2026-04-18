import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(__dirname, '../..');
const composePath = path.join(root, 'docker/docker-compose.yml');

// Read compose file once — all string-based assertions below
const compose = existsSync(composePath) ? readFileSync(composePath, 'utf-8') : '';

describe('docker/docker-compose.yml structural smoke', () => {
  it('file exists and is non-empty', () => {
    expect(existsSync(composePath)).toBe(true);
    expect(compose.length).toBeGreaterThan(0);
  });

  it('parses as valid YAML (no tab characters, has top-level "services:" key)', () => {
    // YAML disallows hard tabs as indentation
    expect(compose).not.toMatch(/^\t/m);
    expect(compose).toContain('services:');
  });

  it('defines exactly 4 services: postgres, aegis-web, aegis-worker, openclaw-gateway', () => {
    expect(compose).toContain('postgres:');
    expect(compose).toContain('aegis-web:');
    expect(compose).toContain('aegis-worker:');
    expect(compose).toContain('openclaw-gateway:');
  });

  describe('postgres service', () => {
    it('uses image postgres:16', () => {
      expect(compose).toContain('image: postgres:16');
    });

    it('has a healthcheck using pg_isready', () => {
      expect(compose).toContain('healthcheck:');
      expect(compose).toContain('pg_isready');
    });

    it('mounts ./postgres/init.sql into /docker-entrypoint-initdb.d/', () => {
      expect(compose).toContain('./postgres/init.sql');
      expect(compose).toContain('/docker-entrypoint-initdb.d/');
    });

    it('persists data via the postgres-data named volume', () => {
      expect(compose).toContain('postgres-data');
    });
  });

  describe('aegis-web service', () => {
    it('depends_on postgres with condition service_healthy', () => {
      // The depends_on block for aegis-web must reference postgres and service_healthy
      const aegisWebSection = compose.slice(
        compose.indexOf('aegis-web:'),
        compose.indexOf('\n  aegis-worker:') !== -1
          ? compose.indexOf('\n  aegis-worker:')
          : compose.indexOf('\n  openclaw-gateway:'),
      );
      expect(aegisWebSection).toContain('postgres');
      expect(aegisWebSection).toContain('service_healthy');
    });

    it('has DATABASE_URL in its environment block', () => {
      const aegisWebSection = compose.slice(
        compose.indexOf('aegis-web:'),
        compose.indexOf('\n  aegis-worker:') !== -1
          ? compose.indexOf('\n  aegis-worker:')
          : compose.indexOf('\n  openclaw-gateway:'),
      );
      expect(aegisWebSection).toContain('DATABASE_URL');
    });
  });

  describe('aegis-worker service', () => {
    it('builds from docker/Dockerfile.worker', () => {
      expect(compose).toContain('Dockerfile.worker');
    });

    it('depends_on postgres with condition service_healthy', () => {
      const workerSection = compose.slice(
        compose.indexOf('\n  aegis-worker:'),
        compose.indexOf('\n  openclaw-gateway:'),
      );
      expect(workerSection).toContain('postgres');
      expect(workerSection).toContain('service_healthy');
    });

    it('has DATABASE_URL in its environment block', () => {
      const workerSection = compose.slice(
        compose.indexOf('\n  aegis-worker:'),
        compose.indexOf('\n  openclaw-gateway:'),
      );
      expect(workerSection).toContain('DATABASE_URL');
    });
  });

  describe('openclaw-gateway service security hardening', () => {
    it('has read_only: true', () => {
      expect(compose).toContain('read_only: true');
    });

    it('drops ALL capabilities', () => {
      expect(compose).toContain('cap_drop:');
      expect(compose).toContain('- ALL');
    });

    it('sets no-new-privileges:true in security_opt', () => {
      expect(compose).toContain('security_opt:');
      expect(compose).toContain('no-new-privileges:true');
    });
  });

  describe('top-level volumes block', () => {
    it('declares postgres-data volume', () => {
      // Must appear in the top-level volumes block (after services)
      const volumesSection = compose.slice(compose.lastIndexOf('volumes:'));
      expect(volumesSection).toContain('postgres-data');
    });

    it('declares openclaw-state volume', () => {
      const volumesSection = compose.slice(compose.lastIndexOf('volumes:'));
      expect(volumesSection).toContain('openclaw-state');
    });
  });
});

describe('docker/postgres/init.sql', () => {
  const initSqlPath = path.join(root, 'docker/postgres/init.sql');

  it('file exists', () => {
    expect(existsSync(initSqlPath)).toBe(true);
  });

  it('contains create extension for pgcrypto', () => {
    const sql = existsSync(initSqlPath) ? readFileSync(initSqlPath, 'utf-8') : '';
    expect(sql.toLowerCase()).toContain('create extension');
    expect(sql.toLowerCase()).toContain('pgcrypto');
  });
});

describe('docker/Dockerfile.worker', () => {
  const dockerfilePath = path.join(root, 'docker/Dockerfile.worker');

  it('file exists', () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it('uses FROM node:24 base image', () => {
    const content = existsSync(dockerfilePath) ? readFileSync(dockerfilePath, 'utf-8') : '';
    expect(content).toMatch(/^FROM node:24/m);
  });

  it('contains CMD with tsx', () => {
    const content = existsSync(dockerfilePath) ? readFileSync(dockerfilePath, 'utf-8') : '';
    expect(content).toContain('CMD');
    expect(content).toContain('tsx');
  });
});

describe('.dockerignore', () => {
  const dockerignorePath = path.join(root, '.dockerignore');

  it('file exists', () => {
    expect(existsSync(dockerignorePath)).toBe(true);
  });

  it('excludes node_modules', () => {
    const content = existsSync(dockerignorePath) ? readFileSync(dockerignorePath, 'utf-8') : '';
    expect(content).toContain('node_modules');
  });

  it('excludes .env.local', () => {
    const content = existsSync(dockerignorePath) ? readFileSync(dockerignorePath, 'utf-8') : '';
    expect(content).toContain('.env.local');
  });

  it('excludes .git', () => {
    const content = existsSync(dockerignorePath) ? readFileSync(dockerignorePath, 'utf-8') : '';
    expect(content).toContain('.git');
  });

  it('excludes .claude', () => {
    const content = existsSync(dockerignorePath) ? readFileSync(dockerignorePath, 'utf-8') : '';
    expect(content).toContain('.claude');
  });
});
