// One autonomy level per connection, applied to the missions this side receives.
// The fixed safeguards do not depend on reading the mission: the agent that executes it
// simply has no tool to price, send to a client, publish or delete. It prepares; a human decides.

/** @typedef {'montrer' | 'demander_avant' | 'faire_puis_valider' | 'faire_seul'} Niveau */

/** @type {readonly Niveau[]} */
export const NIVEAUX = ['montrer', 'demander_avant', 'faire_puis_valider', 'faire_seul'];

/** Most cautious level, used by default and for any unknown value. */
/** @type {Niveau} */
export const NIVEAU_PAR_DEFAUT = 'montrer';

/** @type {Readonly<Record<Niveau, string>>} */
export const LIBELLES = {
  montrer: 'Me montrer seulement',
  demander_avant: 'Demander avant',
  faire_puis_valider: 'Faire, puis valider',
  faire_seul: 'Faire seul',
};

/** SIMATIS OS autonomy marks. */
/** @type {Readonly<Record<Niveau, 'L0' | 'L1' | 'L2' | 'L3'>>} */
export const REPERES = {
  montrer: 'L0',
  demander_avant: 'L1',
  faire_puis_valider: 'L2',
  faire_seul: 'L3',
};

export const GARDE_FOUS = Object.freeze([
  'Prix, devis, engagement',
  'Envoi à un client ou un prospect',
  'Publication',
  'Suppression',
]);

/**
 * @typedef {object} Etape
 * @property {'montrer' | 'demander' | 'preparer' | 'faire'} action
 * @property {boolean} executer Start the (restricted) execution right away.
 * @property {boolean} proposer Show a proposal to the human before anything else.
 * @property {boolean} validerApres The prepared result waits for the human before going back.
 * @property {'working' | null} etat State to send back right away (`null`: stay `submitted`).
 */

/** @type {Readonly<Record<Niveau, Etape>>} */
const ETAPES = {
  montrer: { action: 'montrer', executer: false, proposer: true, validerApres: false, etat: null },
  demander_avant: { action: 'demander', executer: false, proposer: true, validerApres: false, etat: null },
  faire_puis_valider: { action: 'preparer', executer: true, proposer: false, validerApres: true, etat: 'working' },
  faire_seul: { action: 'faire', executer: true, proposer: false, validerApres: false, etat: 'working' },
};

/**
 * @param {unknown} niveau
 * @returns {Niveau}
 */
export function niveauValide(niveau) {
  return NIVEAUX.includes(/** @type {Niveau} */ (niveau)) ? /** @type {Niveau} */ (niveau) : NIVEAU_PAR_DEFAUT;
}

/**
 * First step for a received mission, given the connection's level.
 * @param {unknown} niveau
 * @returns {Etape}
 */
export function premiereEtape(niveau) {
  return { ...ETAPES[niveauValide(niveau)] };
}

/**
 * @param {string} repere L0 to L3
 * @returns {Niveau}
 */
export function niveauDepuisRepere(repere) {
  const trouve = NIVEAUX.find((n) => REPERES[n] === String(repere).toUpperCase());
  return trouve ?? NIVEAU_PAR_DEFAUT;
}
