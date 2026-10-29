export type RelaisSimule = {
    /**
     * Pass it to `creerClient({ fetch })`.
     */
    fetch: typeof fetch;
    url: string;
    /**
     * When true, every call fails like an unreachable network.
     */
    panne: boolean;
    noeuds: Map<string, any>;
    /**
     * Envelopes not yet acknowledged.
     */
    enveloppes: any[];
};
/**
 * @typedef {object} RelaisSimule
 * @property {typeof fetch} fetch Pass it to `creerClient({ fetch })`.
 * @property {string} url
 * @property {boolean} panne When true, every call fails like an unreachable network.
 * @property {Map<string, any>} noeuds
 * @property {any[]} enveloppes Envelopes not yet acknowledged.
 */
/**
 * @param {{ url?: string, cle?: string }} [options]
 * @returns {RelaisSimule}
 */
export declare function relaisSimule({ url, cle }?: {
    url?: string;
    cle?: string;
}): RelaisSimule;
