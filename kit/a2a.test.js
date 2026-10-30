import test from 'node:test';
import assert from 'node:assert/strict';
import { ErreurFormat, carte, etat, lireEtat, lireMessageLibre, lireMission, lireNote, messageLibre, mission, note, valider, verifier } from './a2a.js';

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

test('builds a free message and its answer, apart from mission notes', () => {
  const q = messageLibre({ type: 'question', sujet: '  Atelier fictif  ', texte: 'Voici le compte rendu : https://exemple.fr/cr. **Qu’en penses-tu ?**' });
  assert.deepEqual(verifier('message', q), []);
  assert.equal(q.taskId, undefined);
  assert.deepEqual(lireMessageLibre(q), {
    id: q.messageId,
    type: 'question',
    sujet: 'Atelier fictif',
    texte: 'Voici le compte rendu : https://exemple.fr/cr. **Qu’en penses-tu ?**',
    en_reponse_a: null,
  });
  const r = messageLibre({ type: 'reponse', sujet: 'Re : Atelier fictif', texte: 'D’accord.', en_reponse_a: q.messageId });
  assert.equal(lireMessageLibre(r)?.en_reponse_a, q.messageId);
  assert.equal(lireMessageLibre(note({ texte: 'Plus tard', mission: 'm1' })), null);
  assert.equal(lireMessageLibre(note({ texte: 'Sans mission' })), null);
});

test('refuses a free message with a wrong type, subject or text', () => {
  assert.throws(() => messageLibre({ type: /** @type {any} */ ('demande'), sujet: 'x', texte: 'y' }), /metadata\.type/);
  assert.throws(() => messageLibre({ type: 'info', sujet: 'deux\nlignes', texte: 'y' }), /sujet/);
  assert.throws(() => messageLibre({ type: 'info', sujet: ' ', texte: 'y' }), /sujet/);
  assert.throws(() => messageLibre({ type: 'info', sujet: 'x', texte: '' }), /texte/);
  const recu = { kind: 'message', messageId: 'm', role: 'user', parts: [{ kind: 'text', text: 'y' }], metadata: { type: 'info', sujet: 'x', en_reponse_a: 3 } };
  assert.match(verifier('message', recu).join(), /en_reponse_a/);
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
  assert.notDeepEqual(verifier('donnee', { objet: 'prospect', evenement: 'cree', ref: 'p-1', champs: {} }), []);
  assert.deepEqual(verifier('message', 'texte'), ['corps : objet attendu']);
  assert.throws(() => valider('message', { kind: 'message' }), ErreurFormat);
});
