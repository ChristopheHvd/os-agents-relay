import test from 'node:test';
import assert from 'node:assert/strict';
import { ErreurFormat, carte, donnee, etat, lireDonnee, lireEtat, lireMission, lireNote, mission, note, valider, verifier } from './a2a.js';

test('builds a valid mission (A2A task) and reads it back', () => {
  const m = mission({ consigne: 'Écrire un livre blanc fictif sur la relève', contexte: { echeance: '2026-11-30' }, titre: 'Livre blanc n° 1' });
  assert.equal(m.kind, 'task');
  assert.equal(m.status.state, 'submitted');
  assert.deepEqual(verifier('mission', m), []);
  assert.deepEqual(lireMission(m), {
    id: m.id,
    contextId: m.contextId,
    consigne: 'Écrire un livre blanc fictif sur la relève',
    contexte: { echeance: '2026-11-30' },
    titre: 'Livre blanc n° 1',
  });
  assert.equal(lireMission(mission({ consigne: 'Première ligne\nsuite' })).titre, 'Première ligne');
});

test('refuses a mission without instructions', () => {
  assert.throws(() => mission({ consigne: '  ' }), ErreurFormat);
});

test('builds state updates, final for terminal states', () => {
  const m = mission({ consigne: 'x' });
  const w = etat({ mission: m, etat: 'working' });
  assert.equal(w.final, false);
  assert.equal(w.taskId, m.id);
  assert.equal(w.contextId, m.contextId);
  const c = etat({ mission: m.id, etat: 'completed', message: 'Acceptée', resultat: { titre: 'Titre retenu' } });
  assert.equal(c.final, true);
  assert.deepEqual(lireEtat(c), { mission: m.id, etat: 'completed', message: 'Acceptée', resultat: { titre: 'Titre retenu' }, final: true, quand: c.status.timestamp });
  assert.deepEqual(lireEtat(etat({ mission: 'm', etat: 'completed', resultat: 'Résumé' })).resultat, { resume: 'Résumé' });
  assert.throws(() => etat({ mission: 'm', etat: /** @type {any} */ ('fini') }), ErreurFormat);
});

test('builds a data push with fixed fields', () => {
  const d = donnee({ objet: 'prospect', evenement: 'cree', ref: 'p-1', champs: { entreprise: 'Entreprise fictive', ville: 'Ville fictive' } });
  assert.deepEqual(lireDonnee(d), { objet: 'prospect', evenement: 'cree', ref: 'p-1', champs: { entreprise: 'Entreprise fictive', ville: 'Ville fictive' } });
  assert.throws(() => donnee({ objet: /** @type {any} */ ('client'), evenement: 'cree', ref: 'x' }), /objet/);
  assert.throws(() => donnee({ objet: 'affaire', evenement: 'gagne', ref: '' }), /ref/);
  assert.throws(() => donnee({ objet: 'affaire', evenement: 'gagne', ref: 'a', champs: { montant: /** @type {any} */ ({}) } }), /champs/);
});

test('builds notes and agent cards', () => {
  const n = note({ texte: 'Plus tard', mission: 'm1' });
  assert.deepEqual(lireNote(n), { mission: 'm1', texte: 'Plus tard' });
  const c = carte({ nom: 'OS fictif', description: 'Pour les tests', organisation: 'Société fictive', competences: [{ id: 'livre-blanc', nom: 'Livre blanc' }] });
  assert.equal(c.name, 'OS fictif');
  assert.equal(c.skills[0].id, 'livre-blanc');
  assert.equal(c.provider?.organization, 'Société fictive');
});

test('verifies every envelope type', () => {
  assert.deepEqual(verifier('connexion', { evenement: 'coupee', connexion: { id: 'c' } }), []);
  assert.notDeepEqual(verifier('connexion', { evenement: 'autre' }), []);
  assert.notDeepEqual(verifier('mission', { kind: 'task' }), []);
  assert.notDeepEqual(verifier('etat', { kind: 'status-update', taskId: 'm', status: { state: 'nope', timestamp: 't' }, final: false }), []);
  assert.deepEqual(verifier('etat', { kind: 'status-update', taskId: null, status: { state: 'failed', timestamp: 't' }, final: true }), []);
  assert.deepEqual(verifier('inconnu', {}), ['type inconnu : inconnu']);
  assert.deepEqual(verifier('message', 'texte'), ['corps : objet attendu']);
  assert.throws(() => valider('message', { kind: 'message' }), ErreurFormat);
});
