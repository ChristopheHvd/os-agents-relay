export { ErreurRelais, creerClient, estLienInvitation, lireInvitation } from './client.js';
export { ETATS, ETATS_FINAUX, ErreurFormat, TYPES_MESSAGE, carte, etat, lireEtat, lireMessageLibre, lireMission, lireNote, messageLibre, mission, note, valider, verifier, } from './a2a.js';
export { CHAMPS_QUALIFICATION, CRITERES_QUALIFICATION, MODELE_CRM, OBJETS_CRM, PROFIL_CRM, TAILLE_LOT_MAX, changement, decouper, difference, fusionner, lireLot, lireReference, lot, reference, retenir, } from './crm.js';
export { GARDE_FOUS, LIBELLES, NIVEAUX, NIVEAU_PAR_DEFAUT, REPERES, niveauDepuisRepere, niveauValide, premiereEtape } from './autonomie.js';
export { relever } from './releve.js';
export { DELAI_MAX, DELAI_MIN, DUREE_MAX, delaiApres, deposer, vider } from './envoi.js';
export { stockageMemoire } from './stockage-memoire.js';
export { relaisSimule } from './relais-simule.js';
export type Client = import('./client.js').Client;
export type Connexion = import('./client.js').Connexion;
export type Enveloppe = import('./client.js').Enveloppe;
export type Partenaire = import('./client.js').Partenaire;
export type TypeEnveloppe = import('./client.js').TypeEnveloppe;
export type CarteAgent = import('./a2a.js').CarteAgent;
export type Etat = import('./a2a.js').Etat;
export type EtatMission = import('./a2a.js').EtatMission;
export type Message = import('./a2a.js').Message;
export type Mission = import('./a2a.js').Mission;
export type TypeMessage = import('./a2a.js').TypeMessage;
export type ActionCrm = import('./crm.js').ActionCrm;
export type Changement = import('./crm.js').Changement;
export type ChangementLu = import('./crm.js').ChangementLu;
export type Conflit = import('./crm.js').Conflit;
export type EtatEchange = import('./crm.js').EtatEchange;
export type Fiche = import('./crm.js').Fiche;
export type Fusion = import('./crm.js').Fusion;
export type Instantane = import('./crm.js').Instantane;
export type Lien = import('./crm.js').Lien;
export type Lot = import('./crm.js').Lot;
export type ObjetCrm = import('./crm.js').ObjetCrm;
export type Etape = import('./autonomie.js').Etape;
export type Niveau = import('./autonomie.js').Niveau;
export type Sortie = import('./stockage-memoire.js').Sortie;
export type Stockage = import('./stockage-memoire.js').Stockage;
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
