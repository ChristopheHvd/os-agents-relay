import test from 'node:test';
import assert from 'node:assert/strict';
import { ErreurFormat, etat, mission } from './a2a.js';
import { creerClient } from './client.js';
import { DELAI_MAX, DELAI_MIN, delaiApres, deposer, vider } from './envoi.js';
import { relaisSimule } from './relais-simule.js';
import { stockageMemoire } from './stockage-memoire.js';

async function paire() {
  const relais = relaisSimule();
  const a = creerClient({ url: relais.url, fetch: relais.fetch });
  const b = creerClient({ url: relais.url, fetch: relais.fetch });
  await a.inscrire({ nom: 'A', cle_inscription: 'cle-de-test' });
  const { lien } = await a.inviter();
  const { connexion } = await b.rejoindre({ lien, nom: 'B' });
  relais.enveloppes.length = 0;
  return { relais, a, b, connexion: connexion.id };
}

test('validates before queueing, and sends nothing before vider', async () => {
  const { relais, connexion } = await paire();
  const stockage = stockageMemoire();
  await assert.rejects(deposer({ stockage, connexion, type: 'mission', corps: { kind: 'task' } }), ErreurFormat);
  await deposer({ stockage, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  assert.equal((await stockage.sorties()).length, 1);
  assert.equal(relais.enveloppes.length, 0);
});

test('sends queued envelopes in order and empties the outbox', async () => {
  const { relais, b, connexion } = await paire();
  const stockage = stockageMemoire();
  const m = mission({ consigne: 'x' });
  await deposer({ stockage, connexion, type: 'etat', corps: etat({ mission: m, etat: 'working' }) });
  await deposer({ stockage, connexion, type: 'etat', corps: etat({ mission: m, etat: 'completed' }) });
  const bilan = await vider({ client: b, stockage });
  assert.deepEqual(bilan, { envoyees: 2, reportees: 0, abandonnees: 0 });
  assert.deepEqual(relais.enveloppes.map((e) => e.corps.status.state), ['working', 'completed']);
  assert.equal((await stockage.sorties()).length, 0);
});

test('keeps the envelope id, so a resend after a lost answer is not duplicated', async () => {
  const { relais, b, connexion } = await paire();
  const stockage = stockageMemoire();
  const sortie = await deposer({ stockage, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  await b.envoyer({ id: sortie.id, connexion, type: sortie.type, corps: sortie.corps });
  await vider({ client: b, stockage });
  assert.equal(relais.enveloppes.length, 1);
  assert.equal(relais.enveloppes[0].id, sortie.id);
});

test('postpones on network failure with a growing delay, then sends', async () => {
  const { relais, b, connexion } = await paire();
  const stockage = stockageMemoire();
  await deposer({ stockage, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  relais.panne = true;
  const t0 = Date.now();
  assert.equal((await vider({ client: b, stockage, maintenant: t0 })).reportees, 1);
  const [s1] = await stockage.sorties();
  assert.ok(Date.parse(s1.prochain_essai) - t0 >= DELAI_MIN);

  // Not due yet: nothing is attempted.
  relais.panne = false;
  assert.deepEqual(await vider({ client: b, stockage, maintenant: t0 + 1000 }), { envoyees: 0, reportees: 0, abandonnees: 0 });

  relais.panne = true;
  const t1 = t0 + 10 * 60_000;
  await vider({ client: b, stockage, maintenant: t1 });
  const [s2] = await stockage.sorties();
  assert.ok(Date.parse(s2.prochain_essai) - t1 >= 9 * 60_000);

  relais.panne = false;
  assert.equal((await vider({ client: b, stockage, maintenant: t1 + DELAI_MAX })).envoyees, 1);
  assert.equal(relais.enveloppes.length, 1);
});

test('the retry delay grows from 1 minute to 1 hour', () => {
  assert.equal(delaiApres(0), DELAI_MIN);
  assert.equal(delaiApres(5 * 60_000), 5 * 60_000);
  assert.equal(delaiApres(5 * 3_600_000), DELAI_MAX);
});

test('holds later envelopes of the same connection behind a postponed one', async () => {
  const { relais, b, connexion } = await paire();
  const stockage = stockageMemoire();
  const m = mission({ consigne: 'x' });
  await deposer({ stockage, connexion, type: 'etat', corps: etat({ mission: m, etat: 'working' }) });
  await deposer({ stockage, connexion, type: 'etat', corps: etat({ mission: m, etat: 'completed' }) });
  relais.panne = true;
  await vider({ client: b, stockage });
  relais.panne = false;
  const bilan = await vider({ client: b, stockage });
  assert.deepEqual(bilan, { envoyees: 0, reportees: 0, abandonnees: 0 });
  assert.equal(relais.enveloppes.length, 0);
});

test('abandons on a final refusal from the relay', async () => {
  const { a, b, connexion } = await paire();
  const stockage = stockageMemoire();
  await deposer({ stockage, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  await a.couper(connexion);
  const abandons = [];
  const bilan = await vider({ client: b, stockage, surAbandon: (s, raison) => void abandons.push(raison) });
  assert.equal(bilan.abandonnees, 1);
  assert.deepEqual(abandons, ['connexion inconnue']);
  assert.equal((await stockage.sorties()).length, 0);
});

test('abandons after 30 days without reaching the relay', async () => {
  const { relais, b, connexion } = await paire();
  const stockage = stockageMemoire();
  await deposer({ stockage, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  relais.panne = true;
  const abandons = [];
  const bilan = await vider({ client: b, stockage, maintenant: Date.now() + 31 * 86_400_000, surAbandon: (s, raison) => void abandons.push(raison) });
  assert.equal(bilan.abandonnees, 1);
  assert.match(abandons[0], /30 jours/);
});
