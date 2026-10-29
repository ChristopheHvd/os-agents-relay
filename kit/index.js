export { ErreurRelais, creerClient, estLienInvitation, lireInvitation } from './client.js';
export {
  ETATS,
  ETATS_FINAUX,
  EVENEMENTS_DONNEE,
  ErreurFormat,
  OBJETS_DONNEE,
  carte,
  donnee,
  etat,
  lireDonnee,
  lireEtat,
  lireMission,
  lireNote,
  mission,
  note,
  valider,
  verifier,
} from './a2a.js';
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
/** @typedef {import('./autonomie.js').Etape} Etape */
/** @typedef {import('./autonomie.js').Niveau} Niveau */
/** @typedef {import('./stockage-memoire.js').Sortie} Sortie */
/** @typedef {import('./stockage-memoire.js').Stockage} Stockage */
