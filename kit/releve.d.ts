export type BilanReleve = {
    traitees: number;
    /**
     * Already seen: acknowledged without processing.
     */
    doublons: number;
    /**
     * Malformed body: acknowledged without processing.
     */
    invalides: number;
    /**
     * Processing failed: left at the relay for the next round.
     */
    erreurs: {
        id: string;
        erreur: unknown;
    }[];
};
/**
 * @typedef {object} BilanReleve
 * @property {number} traitees
 * @property {number} doublons Already seen: acknowledged without processing.
 * @property {number} invalides Malformed body: acknowledged without processing.
 * @property {{ id: string, erreur: unknown }[]} erreurs Processing failed: left at the relay for the next round.
 */
/**
 * Picks up the mailbox. Each envelope is processed once (`stockage.dejaVu`), and acknowledged
 * (hence deleted by the relay) only after `traiter` succeeded and the id was recorded.
 *
 * @param {object} options
 * @param {import('./client.js').Client} options.client
 * @param {import('./stockage-memoire.js').Stockage} options.stockage
 * @param {(enveloppe: import('./client.js').Enveloppe) => Promise<void> | void} options.traiter
 * @param {(enveloppe: import('./client.js').Enveloppe, problemes: string[]) => Promise<void> | void} [options.invalide]
 * @param {number} [options.pagesMax]
 * @returns {Promise<BilanReleve>}
 */
export declare function relever({ client, stockage, traiter, invalide, pagesMax }: {
    client: import('./client.js').Client;
    stockage: import('./stockage-memoire.js').Stockage;
    traiter: (enveloppe: import('./client.js').Enveloppe) => Promise<void> | void;
    invalide?: (enveloppe: import('./client.js').Enveloppe, problemes: string[]) => Promise<void> | void;
    pagesMax?: number;
}): Promise<BilanReleve>;
