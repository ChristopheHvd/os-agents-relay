export { ErreurRelais, creerClient, estLienInvitation, lireInvitation } from './client.js';
export {
  ETATS,
  ETATS_FINAUX,
  ErreurFormat,
  TYPES_MESSAGE,
  carte,
  etat,
  lireEtat,
  lireMessageLibre,
  lireMission,
  lireNote,
  messageLibre,
  mission,
  note,
  valider,
  verifier,
} from './a2a.js';
export {
  CHAMPS_QUALIFICATION,
  CRITERES_QUALIFICATION,
  MODELE_CRM,
  OBJETS_CRM,
  PROFIL_CRM,
  TAILLE_LOT_MAX,
  changement,
  decouper,
  difference,
  fusionner,
  lireLot,
  lireReference,
  lot,
  reference,
  retenir,
} from './crm.js';
export { GARDE_FOUS, LIBELLES, NIVEAUX, NIVEAU_PAR_DEFAUT, REPERES, niveauDepuisRepere, niveauValide, premiereEtape } from './autonomie.js';
export { relever } from './releve.js';
export { DELAI_MAX, DELAI_MIN, DUREE_MAX, delaiApres, deposer, vider } from './envoi.js';
export { stockageMemoire } from './stockage-memoire.js';
export { relaisSimule } from './relais-simule.js';

/** @typedef {import('./client.js').Client} Client */
/** @typedef {import('./client.js').Connexion} Connexion */
/** @typedef {import('./client.js').Enveloppe} Enveloppe */
/** @typedef {import('./client.js').Partenaire} Partenaire */
/** @typedef {import('./client.js').TypeEnveloppe} TypeEnveloppe */
/** @typedef {import('./a2a.js').CarteAgent} CarteAgent */
/** @typedef {import('./a2a.js').Etat} Etat */
/** @typedef {import('./a2a.js').EtatMission} EtatMission */
/** @typedef {import('./a2a.js').Message} Message */
/** @typedef {import('./a2a.js').Mission} Mission */
/** @typedef {import('./a2a.js').TypeMessage} TypeMessage */
/** @typedef {import('./crm.js').ActionCrm} ActionCrm */
/** @typedef {import('./crm.js').Changement} Changement */
/** @typedef {import('./crm.js').ChangementLu} ChangementLu */
/** @typedef {import('./crm.js').Conflit} Conflit */
/** @typedef {import('./crm.js').EtatEchange} EtatEchange */
/** @typedef {import('./crm.js').Fiche} Fiche */
/** @typedef {import('./crm.js').Fusion} Fusion */
/** @typedef {import('./crm.js').Instantane} Instantane */
/** @typedef {import('./crm.js').Lien} Lien */
/** @typedef {import('./crm.js').Lot} Lot */
/** @typedef {import('./crm.js').ObjetCrm} ObjetCrm */
/** @typedef {import('./autonomie.js').Etape} Etape */
/** @typedef {import('./autonomie.js').Niveau} Niveau */
/** @typedef {import('./stockage-memoire.js').Sortie} Sortie */
/** @typedef {import('./stockage-memoire.js').Stockage} Stockage */
