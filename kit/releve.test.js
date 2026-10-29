import test from 'node:test';
import assert from 'node:assert/strict';
import { creerClient } from './client.js';
import { mission } from './a2a.js';
import { relaisSimule } from './relais-simule.js';
import { relever } from './releve.js';
import { stockageMemoire } from './stockage-memoire.js';

async function paire() {
  const relais = relaisSimule();
  const a = creerClient({ url: relais.url, fetch: relais.fetch });
  const b = creerClient({ url: relais.url, fetch: relais.fetch });
  await a.inscrire({ nom: 'A', cle_inscription: 'cle-de-test' });
  const { lien } = await a.inviter();
  const { connexion } = await b.rejoindre({ lien, nom: 'B' });
  // Drop the "accepted" notice so each test starts with an empty mailbox for A.
  relais.enveloppes.length = 0;
  return { relais, a, b, connexion: connexion.id };
}

test('processes each envelope once, then acknowledges it', async () => {
  const { relais, a, b, connexion } = await paire();
  const m = mission({ consigne: 'Livre blanc fictif' });
  await b.envoyer({ connexion, type: 'mission', corps: m });
  const stockage = stockageMemoire();
  const recues = [];
  const bilan = await relever({ client: a, stockage, traiter: (e) => void recues.push(e) });
  assert.deepEqual(bilan, { traitees: 1, doublons: 0, invalides: 0, erreurs: [] });
  assert.equal(recues[0].corps.id, m.id);
  assert.equal(relais.enveloppes.length, 0);
});

test('does not process an envelope seen before, but still acknowledges it', async () => {
  const { relais, a, b, connexion } = await paire();
  const id = crypto.randomUUID();
  await b.envoyer({ id, connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  const stockage = stockageMemoire();
  await stockage.marquerVu(id);
  let appels = 0;
  const bilan = await relever({ client: a, stockage, traiter: () => void appels++ });
  assert.equal(appels, 0);
  assert.equal(bilan.doublons, 1);
  assert.equal(relais.enveloppes.length, 0);
});

test('leaves an envelope at the relay when processing fails, and retries it next round', async () => {
  const { relais, a, b, connexion } = await paire();
  await b.envoyer({ connexion, type: 'mission', corps: mission({ consigne: 'x' }) });
  const stockage = stockageMemoire();
  const echec = await relever({ client: a, stockage, traiter: () => { throw new Error('disque plein'); } });
  assert.equal(echec.erreurs.length, 1);
  assert.equal(relais.enveloppes.length, 1);
  assert.equal(stockage.vus.size, 0);

  const reprise = await relever({ client: a, stockage, traiter: () => {} });
  assert.equal(reprise.traitees, 1);
  assert.equal(relais.enveloppes.length, 0);
});

test('acknowledges malformed envelopes without processing them', async () => {
  const { relais, a, b, connexion } = await paire();
  await b.envoyer({ connexion, type: 'mission', corps: { kind: 'task' } });
  const signalees = [];
  let traitees = 0;
  const bilan = await relever({ client: a, stockage: stockageMemoire(), traiter: () => void traitees++, invalide: (e, p) => void signalees.push(p) });
  assert.equal(traitees, 0);
  assert.equal(bilan.invalides, 1);
  assert.ok(signalees[0].length > 0);
  assert.equal(relais.enveloppes.length, 0);
});

test('follows the cursor over several pages, in order', async () => {
  const { relais, a, b, connexion } = await paire();
  for (let i = 0; i < 230; i++) await b.envoyer({ connexion, type: 'message', corps: { kind: 'message', messageId: `m${i}`, role: 'agent', parts: [{ kind: 'text', text: String(i) }] } });
  const ordre = [];
  const bilan = await relever({ client: a, stockage: stockageMemoire(), traiter: (e) => void ordre.push(Number(e.corps.parts[0].text)) });
  assert.equal(bilan.traitees, 230);
  assert.deepEqual(ordre, [...Array(230).keys()]);
  assert.equal(relais.enveloppes.length, 0);
});
