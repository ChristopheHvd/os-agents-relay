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
    // The custom-domain route would otherwise make the Worker see relais.alpes-ia.fr as its origin.
    ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--local-upstream', `127.0.0.1:${port}`, '--upstream-protocol', 'http',
      '--persist-to', etat, '--var', `CLE_INSCRIPTION:${cle}`],
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
    // Shared sales follow-up: record and last exchanged state, by reference, on each side.
    const crmA = new Map();
    const crmB = new Map();
    const refAffaire = kit.reference(b.noeud, 'aff-1');
    /** Sends the local changes of one side, as one or more `donnee` envelopes. */
    const envoyerCrm = async (client, stockage, crm, objets, options) => {
      const changements = [];
      for (const [ref, { fiche, etat }] of crm) {
        const d = kit.difference(etat, fiche);
        if (!d) continue;
        const c = kit.changement({ objet: objets[ref], ref, modifie_le: fiche.modifie_le, ...d });
        crm.get(ref).etat = kit.retenir(etat, c);
        changements.push(c);
      }
      for (const corps of kit.decouper(changements, options)) await kit.deposer({ stockage, connexion, type: 'donnee', corps });
      await kit.vider({ client, stockage });
      return changements.length;
    };
    /** Merges the received batches into one side. */
    const recevoirCrm = (crm, enveloppes) => {
      const conflits = [];
      for (const e of enveloppes) {
        for (const c of kit.lireLot(e.corps).changements) {
          const ici = crm.get(c.ref);
          const f = kit.fusionner(ici?.etat, ici?.fiche, c);
          const fiche = ici?.fiche ?? { champs: {}, liens: {} };
          if (f.appliquer) Object.assign(fiche, { champs: { ...fiche.champs, ...f.appliquer.champs }, liens: { ...fiche.liens, ...f.appliquer.liens }, modifie_le: c.modifie_le });
          crm.set(c.ref, { fiche, etat: f.etat });
          conflits.push(...f.conflits);
        }
      }
      return conflits;
    };
    const objetsB = {
      [kit.reference(b.noeud, 'pipeline')]: 'pipeline',
      [kit.reference(b.noeud, 'ent-1')]: 'entreprise',
      [kit.reference(b.noeud, 'con-1')]: 'contact',
      [refAffaire]: 'affaire',
    };
    await etape('B envoie un instantané CRM fictif, A le relève et le range', async () => {
      const quand = new Date().toISOString();
      const fiches = {
        pipeline: { champs: { etapes: [
          { id: 'decouverte', libelle: 'Découverte', ordre: 1, clos: false, gagne: false, probabilite: 10 },
          { id: 'negociation', libelle: 'Négociation', ordre: 2, clos: false, gagne: false, probabilite: 60 },
        ] } },
        'ent-1': { champs: { nom: 'Entreprise fictive', ville: 'Ville fictive' } },
        'con-1': { champs: { nom: 'Contact fictif', email: 'contact@exemple.fr' }, liens: { entreprises: [kit.reference(b.noeud, 'ent-1')] } },
        'aff-1': { champs: { titre: 'Affaire fictive (e2e)', etape: 'decouverte', montant: 12000 }, liens: { entreprises: [kit.reference(b.noeud, 'ent-1')] } },
      };
      for (const [id, fiche] of Object.entries(fiches)) crmB.set(kit.reference(b.noeud, id), { fiche: { liens: {}, ...fiche, modifie_le: quand }, etat: null });
      assert.equal(await envoyerCrm(b, stockageB, crmB, objetsB, { instantane: true }), 4);
      const recues = await releverTout(a, stockageA);
      assert.deepEqual(recues.map((e) => e.type), ['donnee']);
      assert.equal(kit.lireLot(recues[0].corps).instantane?.pages, 1);
      assert.deepEqual(recevoirCrm(crmA, recues), []);
      assert.equal(crmA.size, 4);
      assert.deepEqual(crmA.get(refAffaire).fiche.champs, { titre: 'Affaire fictive (e2e)', etape: 'decouverte', montant: 12000 });
    });
    await etape("A change l'étape de l'affaire, B la reçoit et rien ne repart", async () => {
      const { fiche } = crmA.get(refAffaire);
      Object.assign(fiche, { champs: { ...fiche.champs, etape: 'negociation' }, modifie_le: new Date().toISOString() });
      assert.equal(await envoyerCrm(a, stockageA, crmA, objetsB), 1);
      assert.deepEqual(recevoirCrm(crmB, await releverTout(b, stockageB)), []);
      assert.equal(crmB.get(refAffaire).fiche.champs.etape, 'negociation');
      assert.equal(await envoyerCrm(b, stockageB, crmB, objetsB), 0);
      assert.equal(await envoyerCrm(a, stockageA, crmA, objetsB), 0);
    });
    await etape('B pose une question en message libre, A y répond', async () => {
      const question = kit.messageLibre({ type: 'question', sujet: 'Atelier fictif (e2e)', texte: 'Le compte rendu est ici : https://exemple.fr/cr. **Des remarques ?**' });
      await kit.deposer({ stockage: stockageB, connexion, type: 'message', corps: question });
      await kit.vider({ client: b, stockage: stockageB });
      const [recue] = await releverTout(a, stockageA);
      const lue = kit.lireMessageLibre(recue.corps);
      assert.equal(lue?.sujet, 'Atelier fictif (e2e)');
      const reponse = kit.messageLibre({ type: 'reponse', sujet: 'Re : Atelier fictif (e2e)', texte: 'Aucune, merci.', en_reponse_a: lue?.id });
      await kit.deposer({ stockage: stockageA, connexion, type: 'message', corps: reponse });
      await kit.vider({ client: a, stockage: stockageA });
      const [retour] = await releverTout(b, stockageB);
      assert.equal(kit.lireMessageLibre(retour.corps)?.en_reponse_a, question.messageId);
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
