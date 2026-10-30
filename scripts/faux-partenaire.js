#!/usr/bin/env node
// A fictitious partner OS, to try an OS's integration by hand:
//   node scripts/faux-partenaire.js --lien <invitation link> [--duree 900]
// It joins through the invitation (no registration key needed), entrusts a "livre blanc"
// mission, sends the snapshot of a sales follow-up (profile crm/1) and asks a question in a free
// message. Then it prints every state, message and CRM change it receives, keeps its copy of the
// follow-up up to date and answers questions. On Ctrl-C, SIGTERM or after --duree seconds it
// unregisters, which cuts the connection.
// Only fictitious data.

import { parseArgs } from 'node:util';
import * as kit from '../kit/index.js';

const { values: options } = parseArgs({ options: { lien: { type: 'string' }, duree: { type: 'string', default: '900' } } });
if (!options.lien) {
  console.error('usage : node scripts/faux-partenaire.js --lien <lien d’invitation> [--duree <secondes>]');
  process.exit(1);
}
const { relais } = kit.lireInvitation(options.lien);
if (!relais) {
  console.error('Il faut le lien complet (https://…/invitations/CODE), pas seulement le code.');
  process.exit(1);
}

const heure = () => new Date().toLocaleTimeString('fr-FR');
const dire = (texte) => console.log(`[${heure()}] ${texte}`);
const client = kit.creerClient({ url: relais });
const stockage = kit.stockageMemoire();

const { connexion } = await client.rejoindre({
  lien: options.lien,
  nom: 'SIMATIS OS (test)',
  carte: kit.carte({ nom: 'SIMATIS OS (test)', description: 'Partenaire fictif pour les essais', organisation: 'Simatis (test)' }),
});
dire(`Connecté à « ${connexion.partenaire.nom} » (connexion ${connexion.id}).`);

const m = kit.mission({
  titre: 'Livre blanc (essai)',
  consigne: 'Proposer le sujet, le plan et une date de livraison pour un livre blanc fictif sur la relève des missions entre agents.',
  contexte: { echeance: 'fin du mois', public: 'dirigeants de TPE (fictif)' },
});
await kit.deposer({ stockage, connexion: connexion.id, type: 'mission', corps: m });

// The shared follow-up: record and last exchanged state, by reference.
/** @type {Map<string, { objet: kit.ObjetCrm, fiche: kit.Fiche, etat: kit.EtatEchange | null }>} */
const crm = new Map();
const ref = (/** @type {string} */ id) => kit.reference(/** @type {string} */ (client.noeud), id);
const dans = (/** @type {number} */ jours) => new Date(Date.now() + jours * 86_400_000).toISOString();
const quand = new Date().toISOString();
const fiches = [
  ['pipeline', 'pipeline', { etapes: [
    { id: 'decouverte', libelle: 'Découverte', ordre: 1, clos: false, gagne: false, probabilite: 10 },
    { id: 'proposition', libelle: 'Proposition', ordre: 2, clos: false, gagne: false, probabilite: 40 },
    { id: 'negociation', libelle: 'Négociation', ordre: 3, clos: false, gagne: false, probabilite: 60 },
    { id: 'gagne', libelle: 'Gagné', ordre: 4, clos: true, gagne: true, probabilite: 100 },
    { id: 'perdu', libelle: 'Perdu', ordre: 5, clos: true, gagne: false, probabilite: 0 },
  ] }, {}],
  ['entreprise', 'ent-essai-1', { nom: 'Entreprise fictive (essai)', secteur: 'Industrie', ville: 'Ville fictive', taille: 25 }, {}],
  ['contact', 'con-essai-1', { nom: 'Contact fictif', fonction: 'Directeur (fictif)', email: 'contact@exemple.fr' }, { entreprises: [ref('ent-essai-1')] }],
  ['affaire', 'aff-essai-1', { titre: 'Accompagnement IA (essai)', etape: 'proposition', montant: 12000, echeance: dans(45).slice(0, 10), origine: 'salon (fictif)', prochaine_etape: 'Relancer après la proposition' },
    { contacts: [ref('con-essai-1')], entreprises: [ref('ent-essai-1')] }],
  ['rendez_vous', 'rdv-essai-1', { titre: 'Atelier de cadrage (essai)', debut: dans(2), fin: dans(2.05), lieu: 'Visio' },
    { contacts: [ref('con-essai-1')], entreprises: [ref('ent-essai-1')], affaires: [ref('aff-essai-1')] }],
  ['tache', 'tac-essai-1', { titre: 'Envoyer la proposition (essai)', type: 'email', echeance: dans(1) }, { affaire: ref('aff-essai-1') }],
  ['activite', 'act-essai-1', { type: 'note', at: quand, titre: 'Premier échange', resume: 'Besoin confirmé (fictif).' }, { affaire: ref('aff-essai-1') }],
];
const instantane = [];
for (const [objet, id, champs, liens] of fiches) {
  const fiche = { champs, liens, modifie_le: quand };
  const c = kit.changement({ objet, ref: ref(id), modifie_le: quand, .../** @type {object} */ (kit.difference(null, fiche)) });
  crm.set(c.ref, { objet, fiche, etat: kit.retenir(null, c) });
  instantane.push(c);
}
const lots = kit.decouper(instantane, { instantane: true });
for (const corps of lots) await kit.deposer({ stockage, connexion: connexion.id, type: 'donnee', corps });
const question = kit.messageLibre({
  type: 'question',
  sujet: 'Atelier de cadrage (essai)',
  texte: 'Le support de l’atelier est ici : https://exemple.fr/atelier-essai.\n\n**Peux-tu le relire avant jeudi ?**',
});
await kit.deposer({ stockage, connexion: connexion.id, type: 'message', corps: question });
const bilan = await kit.vider({ client, stockage });
dire(`Mission « ${kit.lireMission(m).titre} » (${m.id}), instantané CRM (${instantane.length} fiches, ${lots.length} lot) et une question envoyés (${bilan.envoyees} enveloppes).`);

let fini = false;
async function terminer(raison) {
  if (fini) return;
  fini = true;
  dire(`${raison} : désinscription du nœud de test.`);
  await client.desinscrire().catch((e) => dire(`désinscription impossible : ${e.message}`));
  process.exit(0);
}
process.on('SIGINT', () => terminer('Arrêt demandé'));
process.on('SIGTERM', () => terminer('Arrêt demandé'));
setTimeout(() => terminer('Durée écoulée'), Number(options.duree) * 1000);

for (;;) {
  try {
    await kit.relever({
      client,
      stockage,
      traiter: (e) => {
        if (e.type === 'etat') {
          const s = kit.lireEtat(e.corps);
          dire(`État reçu : ${s.etat}${s.message ? ` — ${s.message}` : ''}${s.resultat ? ` ${JSON.stringify(s.resultat)}` : ''}`);
        } else if (e.type === 'message') {
          const libre = kit.lireMessageLibre(e.corps);
          if (!libre) return void dire(`Note reçue : ${kit.lireNote(e.corps).texte}`);
          dire(`Message libre reçu (${libre.type}) « ${libre.sujet} »${libre.en_reponse_a ? ` en réponse à ${libre.en_reponse_a}` : ''} :\n${libre.texte}`);
          if (libre.type === 'question') {
            const reponse = kit.messageLibre({ type: 'reponse', sujet: `Re : ${libre.sujet}`, texte: 'Bien reçu, je regarde (réponse automatique du partenaire fictif).', en_reponse_a: libre.id });
            return kit.deposer({ stockage, connexion: connexion.id, type: 'message', corps: reponse }).then(() => dire('Réponse automatique déposée.'));
          }
        } else if (e.type === 'donnee') {
          const { changements, instantane: page } = kit.lireLot(e.corps);
          dire(`Lot CRM reçu : ${changements.length} changement(s)${page ? `, instantané page ${page.page}/${page.pages}` : ''}`);
          for (const c of changements) {
            const ici = crm.get(c.ref);
            const f = kit.fusionner(ici?.etat, ici?.fiche, c);
            if (f.suppression) {
              dire(`  ${c.objet} ${c.ref} supprimé chez le partenaire : gardé ici, détaché du partage.`);
              crm.delete(c.ref);
              continue;
            }
            const fiche = ici?.fiche ?? { champs: {}, liens: {} };
            if (f.appliquer) Object.assign(fiche, { champs: { ...fiche.champs, ...f.appliquer.champs }, liens: { ...fiche.liens, ...f.appliquer.liens }, modifie_le: new Date().toISOString() });
            crm.set(c.ref, { objet: c.objet, fiche, etat: f.etat });
            dire(`  ${c.objet} ${c.ref} : ${JSON.stringify({ ...c.champs, ...c.liens })}`);
            for (const x of f.conflits) dire(`  conflit sur ${x.nom} : ${JSON.stringify(x.local)} ici, ${JSON.stringify(x.recu)} reçu ; garde ${x.gagnant === 'local' ? 'ici' : 'reçu'}.`);
          }
        } else if (e.type === 'connexion') {
          dire(`Connexion : ${e.corps.evenement}`);
          if (e.corps.evenement === 'coupee') terminer('Connexion coupée par le partenaire');
        } else {
          dire(`Enveloppe ${e.type} reçue`);
        }
      },
    });
    await kit.vider({ client, stockage });
  } catch (e) {
    dire(`relève impossible : ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
