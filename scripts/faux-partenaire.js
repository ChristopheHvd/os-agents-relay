#!/usr/bin/env node
// A fictitious partner OS, to try an OS's integration by hand:
//   node scripts/faux-partenaire.js --lien <invitation link> [--duree 900]
// It joins through the invitation (no registration key needed), entrusts a "livre blanc"
// mission and pushes two facts, then prints every state and message it receives. On Ctrl-C,
// SIGTERM or after --duree seconds it unregisters, which cuts the connection.
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
await kit.deposer({
  stockage,
  connexion: connexion.id,
  type: 'donnee',
  corps: kit.donnee({ objet: 'prospect', evenement: 'cree', ref: 'essai-prospect-1', champs: { entreprise: 'Entreprise fictive (essai)', ville: 'Ville fictive', resume: 'venu par un salon (fictif)' } }),
});
await kit.deposer({
  stockage,
  connexion: connexion.id,
  type: 'donnee',
  corps: kit.donnee({ objet: 'rendez_vous', evenement: 'cree', ref: 'essai-rdv-1', champs: { entreprise: 'Société exemple (essai)', ville: 'Ville fictive', date: 'jeudi, 10 h' } }),
});
const bilan = await kit.vider({ client, stockage });
dire(`Mission « ${kit.lireMission(m).titre} » (${m.id}) et 2 données envoyées (${bilan.envoyees} enveloppes).`);

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
          dire(`Message reçu : ${kit.lireNote(e.corps).texte}`);
        } else if (e.type === 'connexion') {
          dire(`Connexion : ${e.corps.evenement}`);
          if (e.corps.evenement === 'coupee') terminer('Connexion coupée par le partenaire');
        } else {
          dire(`Enveloppe ${e.type} reçue`);
        }
      },
    });
  } catch (e) {
    dire(`relève impossible : ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
