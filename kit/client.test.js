import test from 'node:test';
import assert from 'node:assert/strict';
import { ErreurRelais, creerClient, estLienInvitation, lireInvitation } from './client.js';

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWX';

/** Fake fetch that records calls and answers from a queue. */
function fauxFetch(...reponses) {
  const appels = [];
  const fetch = async (url, init) => {
    appels.push({ url, methode: init.method, headers: init.headers, corps: init.body ? JSON.parse(init.body) : undefined });
    const r = reponses.shift() ?? { status: 200, json: {} };
    if (r.reseau) throw new TypeError('fetch failed');
    return new Response(r.json === undefined ? '' : JSON.stringify(r.json), { status: r.status ?? 200 });
  };
  return { fetch, appels };
}

test('registers with the key, then authenticates with id.secret', async () => {
  const { fetch, appels } = fauxFetch({ status: 201, json: { id: 'n1', secret: 's1' } }, { json: { connexions: [] } });
  const client = creerClient({ url: 'https://relais.test/', fetch });
  assert.equal(client.inscrit, false);
  await client.inscrire({ nom: 'OS fictif', cle_inscription: 'cle' });
  assert.deepEqual(appels[0].corps, { nom: 'OS fictif', cle_inscription: 'cle' });
  assert.equal(appels[0].url, 'https://relais.test/noeuds');
  assert.equal(appels[0].headers.authorization, undefined);
  assert.equal(client.inscrit, true);
  assert.deepEqual(await client.connexions(), []);
  assert.equal(appels[1].headers.authorization, 'Bearer n1.s1');
});

test('refuses authenticated calls without identity', async () => {
  const client = creerClient({ url: 'https://relais.test', fetch: fauxFetch().fetch });
  await assert.rejects(client.connexions(), (e) => e instanceof ErreurRelais && e.status === 401);
});

test('turns relay errors into ErreurRelais with status and message', async () => {
  const { fetch } = fauxFetch({ status: 403, json: { erreur: 'connexion coupée' } });
  const client = creerClient({ url: 'https://relais.test', noeud: 'n', secret: 's', fetch });
  await assert.rejects(client.envoyer({ connexion: 'c', type: 'message', corps: {} }), (e) => {
    assert.equal(e.status, 403);
    assert.equal(e.message, 'connexion coupée');
    assert.equal(e.passagere, false);
    return true;
  });
});

test('network failures and server errors are temporary', async () => {
  const { fetch } = fauxFetch({ reseau: true }, { status: 503 }, { status: 429, json: { erreur: 'trop' } });
  const client = creerClient({ url: 'https://relais.test', noeud: 'n', secret: 's', fetch });
  for (let i = 0; i < 3; i++) {
    await assert.rejects(client.boite(), (e) => e instanceof ErreurRelais && e.passagere);
  }
});

test('posts envelopes with the id for idempotent retries, and pages the mailbox', async () => {
  const { fetch, appels } = fauxFetch({ status: 201, json: { id: 'e1' } }, { json: { enveloppes: [], curseur: 'k', suite: false } }, { json: { acquittees: 2 } });
  const client = creerClient({ url: 'https://relais.test', noeud: 'n', secret: 's', fetch });
  await client.envoyer({ id: 'e1', connexion: 'c', type: 'mission', corps: { a: 1 } });
  assert.deepEqual(appels[0].corps, { id: 'e1', connexion: 'c', type: 'mission', corps: { a: 1 } });
  await client.boite('a/b+c');
  assert.equal(appels[1].url, 'https://relais.test/boite?apres=a%2Fb%2Bc');
  await client.acquitter(['x', 'y']);
  assert.deepEqual(appels[2].corps, { ids: ['x', 'y'] });
});

test('reads invitation links and bare codes', () => {
  assert.deepEqual(lireInvitation(` https://relais.test/invitations/${CODE} `), { code: CODE, relais: 'https://relais.test' });
  assert.deepEqual(lireInvitation(CODE), { code: CODE, relais: null });
  assert.throws(() => lireInvitation('contact@exemple.fr'), ErreurRelais);
  assert.throws(() => lireInvitation('https://relais.test/autre/chose'), ErreurRelais);
  assert.equal(estLienInvitation(`https://relais.test/invitations/${CODE}`), true);
  assert.equal(estLienInvitation('contact@exemple.fr'), false);
});

test('refuses an invitation from another relay', async () => {
  const client = creerClient({ url: 'https://relais.test', noeud: 'n', secret: 's', fetch: fauxFetch().fetch });
  await assert.rejects(client.accepter(`https://ailleurs.test/invitations/${CODE}`), /autre relais/);
});

test('joins by accepting when registered, by registering otherwise', async () => {
  const connexion = { id: 'c1', cree_le: 't', partenaire: { id: 'p', nom: 'P', carte: null, vu_le: null } };
  const inscrit = fauxFetch({ status: 201, json: { connexion } });
  const a = creerClient({ url: 'https://relais.test', noeud: 'n', secret: 's', fetch: inscrit.fetch });
  assert.deepEqual(await a.rejoindre({ lien: `https://relais.test/invitations/${CODE}`, nom: 'X' }), { connexion });
  assert.equal(inscrit.appels[0].url, `https://relais.test/invitations/${CODE}/accepter`);

  const nouveau = fauxFetch({ status: 201, json: { id: 'n2', secret: 's2', connexion } });
  const b = creerClient({ url: 'https://relais.test', fetch: nouveau.fetch });
  const r = await b.rejoindre({ lien: `https://relais.test/invitations/${CODE}`, nom: 'Instance fictive' });
  assert.deepEqual(nouveau.appels[0].corps, { nom: 'Instance fictive', invitation: CODE });
  assert.deepEqual(r.connexion, connexion);
  assert.equal(r.inscription.secret, 's2');
  assert.equal(b.noeud, 'n2');
});
