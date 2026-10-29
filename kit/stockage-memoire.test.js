import test from 'node:test';
import assert from 'node:assert/strict';
import { stockageMemoire } from './stockage-memoire.js';

test('implements the storage interface', async () => {
  const s = stockageMemoire();
  assert.equal(await s.dejaVu('x'), false);
  await s.marquerVu('x');
  assert.equal(await s.dejaVu('x'), true);
  await s.ajouterSortie({ id: 'e', connexion: 'c', type: 'message', corps: {}, cree_le: 't' });
  await s.reporterSortie('e', '2026-01-01T00:00:00.000Z');
  const [sortie] = await s.sorties();
  assert.equal(sortie.prochain_essai, '2026-01-01T00:00:00.000Z');
  sortie.connexion = 'modifiee';
  assert.equal((await s.sorties())[0].connexion, 'c');
  await s.retirerSortie('e');
  assert.deepEqual(await s.sorties(), []);
});
