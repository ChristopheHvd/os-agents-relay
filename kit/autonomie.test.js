import test from 'node:test';
import assert from 'node:assert/strict';
import { GARDE_FOUS, LIBELLES, NIVEAUX, niveauDepuisRepere, premiereEtape } from './autonomie.js';

test('maps each level to its first step', () => {
  assert.deepEqual(premiereEtape('montrer'), { action: 'montrer', executer: false, proposer: true, validerApres: false, etat: null });
  assert.deepEqual(premiereEtape('demander_avant'), { action: 'demander', executer: false, proposer: true, validerApres: false, etat: null });
  assert.deepEqual(premiereEtape('faire_puis_valider'), { action: 'preparer', executer: true, proposer: false, validerApres: true, etat: 'working' });
  assert.deepEqual(premiereEtape('faire_seul'), { action: 'faire', executer: true, proposer: false, validerApres: false, etat: 'working' });
});

test('falls back to the most cautious level for unknown values', () => {
  assert.equal(premiereEtape('tout_faire').action, 'montrer');
  assert.equal(premiereEtape(undefined).action, 'montrer');
});

test('returns a copy that callers cannot use to alter the table', () => {
  premiereEtape('montrer').executer = true;
  assert.equal(premiereEtape('montrer').executer, false);
});

test('labels every level and maps SIMATIS OS marks', () => {
  for (const n of NIVEAUX) assert.ok(LIBELLES[n]);
  assert.equal(niveauDepuisRepere('L2'), 'faire_puis_valider');
  assert.equal(niveauDepuisRepere('l3'), 'faire_seul');
  assert.equal(niveauDepuisRepere('L9'), 'montrer');
  assert.equal(GARDE_FOUS.length, 4);
  assert.throws(() => /** @type {any} */ (GARDE_FOUS).push('autre'));
});
