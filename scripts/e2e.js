#!/usr/bin/env node
// End-to-end check of the kit against a real relay.
//   npm run e2e                                   local relay (wrangler dev), started and stopped here
//   npm run e2e -- --url https://relais.example   deployed relay; registration key read from
//                                                 .secrets/cle-inscription (or --cle <file>)
// Two throwaway nodes are registered and unregistered at the end. Only fictitious data.

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, parseArgs } from 'node:util';
import * as kit from '../kit/index.js';

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dossierRelais = path.join(racine, 'relais');
const wrangler = path.join(dossierRelais, 'node_modules', '.bin', 'wrangler');
const { values: options } = parseArgs({ options: { url: { type: 'string' }, cle: { type: 'string' } } });

function portLibre() {
  return new Promise((resolve, reject) => {
    const serveur = createServer();
    serveur.once('error', reject);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (serveur.address());
      serveur.close(() => resolve(port));
    });
  });
}

async function attendreSante(url, journal, delaiMax = 60_000) {
  const fin = Date.now() + delaiMax;
  while (Date.now() < fin) {
    try {
      const res = await fetch(`${url}/sante`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`le relais local ne répond pas sur ${url}\n${journal.join('').slice(-3000)}`);
}

/** Starts `wrangler dev` on a fresh local database; returns the URL, the key and a stop function. */
async function relaisLocal() {
  const etat = await mkdtemp(path.join(tmpdir(), 'relais-e2e-'));
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  await promisify(execFile)(wrangler, ['d1', 'migrations', 'apply', 'os-agents-relay', '--local', '--persist-to', etat], {
    cwd: dossierRelais,
    env,
  });
  const port = await portLibre();
  const cle = randomBytes(32).toString('base64url');
  const processus = spawn(
    wrangler,
    ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', etat, '--var', `CLE_INSCRIPTION:${cle}`],
    { cwd: dossierRelais, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const journal = [];
  processus.stdout.on('data', (d) => journal.push(String(d)));
  processus.stderr.on('data', (d) => journal.push(String(d)));
  const url = `http://127.0.0.1:${port}`;
  const arreter = async () => {
    try {
      // wrangler spawns workerd: stop the whole process group.
      process.kill(-processus.pid, 'SIGTERM');
    } catch {
      // Already stopped.
    }
    await rm(etat, { recursive: true, force: true });
  };
  try {
    await attendreSante(url, journal);
  } catch (e) {
    await arreter();
    throw e;
  }
  return { url, cle, arreter };
}

async function relaisDistant(url) {
  const fichier = options.cle ?? path.join(racine, '.secrets', 'cle-inscription');
  const cle = process.env.CLE_INSCRIPTION ?? (await readFile(fichier, 'utf8')).trim();
  await attendreSante(url, [], 15_000);
  return { url, cle, arreter: async () => {} };
}

let numero = 0;
async function etape(titre, faire) {
  numero++;
  await faire();
  console.log(`  ✓ ${String(numero).padStart(2)}. ${titre}`);
}

async function scenario(url, cle) {
  const carteA = kit.carte({ nom: 'Alpes OS (e2e)', description: 'Nœud jetable du test de bout en bout', competences: [{ id: 'livre-blanc', nom: 'Livre blanc' }] });
  const carteB = kit.carte({ nom: 'SIMATIS OS (e2e)', description: 'Nœud jetable du test de bout en bout' });
  const a = kit.creerClient({ url });
  const b = kit.creerClient({ url });
  const stockageA = kit.stockageMemoire();
  const stockageB = kit.stockageMemoire();
  /** @param {kit.Client} client @param {ReturnType<typeof kit.stockageMemoire>} stockage */
  const releverTout = async (client, stockage) => {
    const recues = [];
    const bilan = await kit.relever({ client, stockage, traiter: (e) => void recues.push(e) });
    assert.deepEqual(bilan.erreurs, []);
    assert.equal(bilan.invalides, 0);
    return recues;
  };
  let connexion = '';
  let m;

  try {
    await etape("A s'inscrit avec la clé d'inscription", async () => {
      await a.inscrire({ nom: 'Alpes OS (e2e)', cle_inscription: cle });
      assert.ok(a.inscrit);
    });
    await etape('A publie sa carte', async () => {
      await a.publierCarte(carteA);
      assert.equal((await a.moi()).carte?.name, 'Alpes OS (e2e)');
    });
    let lien = '';
    await etape('A crée une invitation', async () => {
      ({ lien } = await a.inviter({ email: 'contact@exemple.fr' }));
      assert.ok(kit.estLienInvitation(lien));
    });
    await etape("B s'inscrit par le lien d'invitation, sans clé", async () => {
      const r = await b.rejoindre({ lien, nom: 'SIMATIS OS (e2e)', carte: carteB });
      connexion = r.connexion.id;
      assert.equal(r.connexion.partenaire.id, a.noeud);
    });
    await etape('la connexion est visible des deux côtés', async () => {
      assert.ok((await a.connexions()).some((c) => c.id === connexion && c.partenaire.id === b.noeud));
      assert.ok((await b.connexions()).some((c) => c.id === connexion && c.partenaire.nom === 'Alpes OS (e2e)'));
    });
    await etape("A relève l'avis de connexion", async () => {
      const [avis] = await releverTout(a, stockageA);
      assert.equal(avis.type, 'connexion');
      assert.equal(avis.corps.evenement, 'acceptee');
      assert.equal(avis.corps.connexion.partenaire.carte.name, 'SIMATIS OS (e2e)');
    });
    await etape('B confie une mission « livre blanc » par sa file d’envoi', async () => {
      m = kit.mission({ consigne: 'Rédiger un livre blanc fictif sur la relève des missions entre agents.', titre: 'Livre blanc (e2e)' });
      await kit.deposer({ stockage: stockageB, connexion, type: 'mission', corps: m });
      assert.equal((await kit.vider({ client: b, stockage: stockageB })).envoyees, 1);
    });
    await etape('A relève la mission, une seule fois', async () => {
      const recues = await releverTout(a, stockageA);
      assert.equal(recues.length, 1);
      assert.equal(kit.lireMission(recues[0].corps).titre, 'Livre blanc (e2e)');
      assert.equal((await releverTout(a, stockageA)).length, 0);
    });
    await etape('niveau « Faire, puis valider » : A renvoie working, puis completed', async () => {
      const premiere = kit.premiereEtape('faire_puis_valider');
      assert.equal(premiere.etat, 'working');
      await kit.deposer({ stockage: stockageA, connexion, type: 'etat', corps: kit.etat({ mission: m, etat: premiere.etat }) });
      await kit.deposer({
        stockage: stockageA,
        connexion,
        type: 'etat',
        corps: kit.etat({ mission: m, etat: 'completed', message: 'Acceptée', resultat: { titre: 'Livre blanc (e2e), titre retenu' } }),
      });
      assert.equal((await kit.vider({ client: a, stockage: stockageA })).envoyees, 2);
    });
    await etape('B relève les deux états, dans l’ordre', async () => {
      const etats = (await releverTout(b, stockageB)).map((e) => kit.lireEtat(e.corps));
      assert.deepEqual(etats.map((e) => e.etat), ['working', 'completed']);
      assert.equal(etats[1].mission, m.id);
      assert.equal(etats[1].resultat?.titre, 'Livre blanc (e2e), titre retenu');
    });
    await etape('B pousse une donnée, A la relève', async () => {
      const d = kit.donnee({ objet: 'prospect', evenement: 'cree', ref: 'e2e-1', champs: { entreprise: 'Entreprise fictive', ville: 'Ville fictive' } });
      await kit.deposer({ stockage: stockageB, connexion, type: 'donnee', corps: d });
      await kit.vider({ client: b, stockage: stockageB });
      const [recue] = await releverTout(a, stockageA);
      assert.deepEqual(kit.lireDonnee(recue.corps), { objet: 'prospect', evenement: 'cree', ref: 'e2e-1', champs: { entreprise: 'Entreprise fictive', ville: 'Ville fictive' } });
    });
    await etape('B coupe la connexion, A est averti et ne peut plus envoyer', async () => {
      await b.couper(connexion);
      const [avis] = await releverTout(a, stockageA);
      assert.equal(avis.corps.evenement, 'coupee');
      await assert.rejects(a.envoyer({ connexion, type: 'message', corps: kit.note({ texte: 'encore là ?' }) }), (e) => e instanceof kit.ErreurRelais && e.status === 403);
    });
  } finally {
    for (const client of [a, b]) {
      if (client.inscrit) await client.desinscrire().catch(() => {});
    }
  }
  await etape('les deux nœuds sont désinscrits', async () => {
    await assert.rejects(a.moi(), (e) => e instanceof kit.ErreurRelais && e.status === 401);
    await assert.rejects(b.moi(), (e) => e instanceof kit.ErreurRelais && e.status === 401);
  });
}

const relais = options.url ? await relaisDistant(options.url.replace(/\/+$/, '')) : await relaisLocal();
console.log(`Bout en bout contre ${relais.url}`);
try {
  await scenario(relais.url, relais.cle);
  console.log(`OK : ${numero} étapes.`);
} catch (e) {
  console.error(`ÉCHEC à l'étape ${numero + 1} :`, e);
  process.exitCode = 1;
} finally {
  await relais.arreter();
}
