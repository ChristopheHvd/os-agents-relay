export declare const DELAI_MIN = 60000;
export declare const DELAI_MAX = 3600000;
export declare const DUREE_MAX: number;
/**
 * Retry delay grows with the age of the envelope (1 min, 1 min, 2, 4, 8… capped at 1 h),
 * so the outbox needs no attempt counter.
 * @param {number} age Milliseconds since the envelope was queued.
 */
export declare const delaiApres: (age: number) => number;
/**
 * Validates and queues an envelope in the local outbox. Nothing leaves before `vider`.
 * @param {object} options
 * @param {import('./stockage-memoire.js').Stockage} options.stockage
 * @param {string} options.connexion
 * @param {import('./client.js').TypeEnveloppe} options.type
 * @param {Record<string, any>} options.corps
 * @returns {Promise<import('./stockage-memoire.js').Sortie>}
 */
export declare function deposer({ stockage, connexion, type, corps }: {
    stockage: import('./stockage-memoire.js').Stockage;
    connexion: string;
    type: import('./client.js').TypeEnveloppe;
    corps: Record<string, any>;
}): Promise<import('./stockage-memoire.js').Sortie>;
export type BilanEnvoi = {
    envoyees: number;
    reportees: number;
    abandonnees: number;
};
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
export declare function vider({ client, stockage, surAbandon, maintenant }: {
    client: import('./client.js').Client;
    stockage: import('./stockage-memoire.js').Stockage;
    surAbandon?: (sortie: import('./stockage-memoire.js').Sortie, raison: string) => Promise<void> | void;
    maintenant?: number;
}): Promise<BilanEnvoi>;
