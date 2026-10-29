import { valider } from './a2a.js';
import { ErreurRelais } from './client.js';

export const DELAI_MIN = 60_000;
export const DELAI_MAX = 3_600_000;
export const DUREE_MAX = 30 * 86_400_000;

/**
 * Retry delay grows with the age of the envelope (1 min, 1 min, 2, 4, 8… capped at 1 h),
 * so the outbox needs no attempt counter.
 * @param {number} age Milliseconds since the envelope was queued.
 */
export const delaiApres = (age) => Math.min(DELAI_MAX, Math.max(DELAI_MIN, age));

/**
 * Validates and queues an envelope in the local outbox. Nothing leaves before `vider`.
 * @param {object} options
 * @param {import('./stockage-memoire.js').Stockage} options.stockage
 * @param {string} options.connexion
 * @param {import('./client.js').TypeEnveloppe} options.type
 * @param {Record<string, any>} options.corps
 * @returns {Promise<import('./stockage-memoire.js').Sortie>}
 */
export async function deposer({ stockage, connexion, type, corps }) {
  valider(type, corps);
  const sortie = { id: crypto.randomUUID(), connexion, type, corps, cree_le: new Date().toISOString(), prochain_essai: null };
  await stockage.ajouterSortie(sortie);
  return sortie;
}

/**
 * @typedef {object} BilanEnvoi
 * @property {number} envoyees
 * @property {number} reportees
 * @property {number} abandonnees
 */

/**
 * Sends the due envelopes of the outbox. A temporary failure postpones the envelope (and the
 * following ones on the same connection, to keep their order); a final refusal from the relay,
 * or 30 days without success, abandons it and calls `surAbandon`.
 *
 * @param {object} options
 * @param {import('./client.js').Client} options.client
 * @param {import('./stockage-memoire.js').Stockage} options.stockage
 * @param {(sortie: import('./stockage-memoire.js').Sortie, raison: string) => Promise<void> | void} [options.surAbandon]
 * @param {number} [options.maintenant]
 * @returns {Promise<BilanEnvoi>}
 */
export async function vider({ client, stockage, surAbandon, maintenant = Date.now() }) {
  /** @type {BilanEnvoi} */
  const bilan = { envoyees: 0, reportees: 0, abandonnees: 0 };
  const sorties = (await stockage.sorties()).sort((x, y) => x.cree_le.localeCompare(y.cree_le));
  /** @type {Set<string>} */
  const bloquees = new Set();
  for (const sortie of sorties) {
    if (bloquees.has(sortie.connexion)) continue;
    if (sortie.prochain_essai && Date.parse(sortie.prochain_essai) > maintenant) {
      bloquees.add(sortie.connexion);
      continue;
    }
    try {
      await client.envoyer({ id: sortie.id, connexion: sortie.connexion, type: sortie.type, corps: sortie.corps });
      await stockage.retirerSortie(sortie.id);
      bilan.envoyees++;
    } catch (erreur) {
      const age = maintenant - Date.parse(sortie.cree_le);
      const passagere = !(erreur instanceof ErreurRelais) || erreur.passagere;
      if (passagere && age < DUREE_MAX) {
        await stockage.reporterSortie(sortie.id, new Date(maintenant + delaiApres(age)).toISOString());
        bloquees.add(sortie.connexion);
        bilan.reportees++;
      } else {
        await stockage.retirerSortie(sortie.id);
        bilan.abandonnees++;
        const raison = passagere ? 'relais injoignable pendant 30 jours' : erreur instanceof Error ? erreur.message : String(erreur);
        await surAbandon?.(sortie, raison);
      }
    }
  }
  return bilan;
}
