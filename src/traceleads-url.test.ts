import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTraceleadsApiOrigin } from './traceleads-url.js';

describe('resolveTraceleadsApiOrigin', () => {
  const keys = [
    'TRACELEADS_API_URL',
    'TRACELEADS_API_HOST',
    'TRACELEADS_API_PROTOCOL',
    'TRACELEADS_API_PORT',
  ] as const;
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      backup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it('usa TRACELEADS_API_URL e remove barra final', () => {
    process.env.TRACELEADS_API_URL = 'https://api.example.com/';
    assert.equal(resolveTraceleadsApiOrigin(), 'https://api.example.com');
  });

  it('prefixa https quando URL vem sem protocolo', () => {
    process.env.TRACELEADS_API_URL = 'api.example.com';
    assert.equal(resolveTraceleadsApiOrigin(), 'https://api.example.com');
  });

  it('compõe host + protocol + port', () => {
    process.env.TRACELEADS_API_HOST = 'localhost';
    process.env.TRACELEADS_API_PROTOCOL = 'http';
    process.env.TRACELEADS_API_PORT = '3000';
    assert.equal(resolveTraceleadsApiOrigin(), 'http://localhost:3000');
  });

  it('falha sem URL nem host', () => {
    assert.throws(() => resolveTraceleadsApiOrigin(), /TRACELEADS_API_URL/);
  });
});
