import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtroMercadoBaseSchema,
  filtroMercadoToQueryParams,
} from './filter-params.js';

describe('filter-params', () => {
  it('filtroMercadoBaseSchema uppercases UFs and accepts CNAE CSV', () => {
    const parsed = filtroMercadoBaseSchema.parse({
      ufs: ['sp', 'rj'],
      cnae: '41,42',
      temEmail: true,
      capitalMin: 1000,
    });
    assert.deepEqual(parsed.ufs, ['SP', 'RJ']);
    assert.equal(parsed.cnae, '41,42');
    assert.equal(parsed.temEmail, true);
  });

  it('filtroMercadoToQueryParams maps booleans and joined UFs', () => {
    const q = filtroMercadoToQueryParams({
      ufs: ['SP', 'MG'],
      temEmail: true,
      temTelefone: false,
      cnae: '62',
      municipio: 'Campinas',
    });
    assert.equal(q.uf, 'SP,MG');
    assert.equal(q.temEmail, 'true');
    assert.equal(q.temTelefone, 'false');
    assert.equal(q.cnae, '62');
    assert.equal(q.municipio, 'Campinas');
  });

  it('rejects invalid UF length', () => {
    assert.throws(() =>
      filtroMercadoBaseSchema.parse({ ufs: ['SAO'] }),
    );
  });
});
