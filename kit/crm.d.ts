export declare const PROFIL_CRM = "crm/1";
/** UTF-8 bytes of a batch: the relay takes 256 KiB per envelope, 1 KiB is left for the envelope itself. */
export declare const TAILLE_LOT_MAX: number;
/** Also the sending order: a record comes after the ones it links to. */
export declare const OBJETS_CRM: readonly ['pipeline', 'entreprise', 'contact', 'affaire', 'tache', 'rendez_vous', 'activite'];
export declare const CRITERES_QUALIFICATION: readonly ['besoin', 'decideur', 'budget', 'timing', 'engagement'];
/** Deal fields shared only when Marc decides so, connection by connection. */
export declare const CHAMPS_QUALIFICATION: readonly ['qualification', 'potentiel', 'faisabilite'];
export type ObjetCrm = (typeof OBJETS_CRM)[number];
export type ActionCrm = 'maj' | 'supprime';
export type TypeSimple = 'texte' | 'entier' | 'pourcentage' | 'booleen' | 'date' | 'horodatage' | 'textes' | 'qualification' | 'dates_etapes' | 'etapes';
export type TypeChamp = TypeSimple | readonly string[];
export type TypeLien = {
    vers: ObjetCrm;
    multiple: boolean;
};
export type DefinitionObjet = {
    champs: Readonly<Record<string, TypeChamp>>;
    /**
     * Never emptied.
     */
    obligatoires: readonly string[];
    liens: Readonly<Record<string, TypeLien>>;
};
export type Lien = string | string[] | null;
export type Changement = {
    objet: ObjetCrm;
    /**
     * `<origin node>/<local id>`, stable.
     */
    ref: string;
    /**
     * `maj` creates the record when missing. `supprime` never deletes it on the other side by itself.
     */
    action: ActionCrm;
    modifie_le: string;
    /**
     * Only the changed fields; null empties one, a field left out does not change.
     */
    champs?: Record<string, unknown>;
    /**
     * The whole list of a link that changed.
     */
    liens?: Record<string, Lien>;
};
export type ChangementLu = Changement & {
    champs: Record<string, unknown>;
    liens: Record<string, Lien>;
};
export type Instantane = {
    id: string;
    page: number;
    pages: number;
};
export type Lot = {
    profil: typeof PROFIL_CRM;
    changements: Changement[];
    instantane?: Instantane;
};
export type Fiche = {
    /**
     * A field left out is not shared (nothing changes on the other side); null empties it.
     */
    champs?: Record<string, unknown>;
    liens?: Record<string, Lien>;
    /**
     * Last change of the record (updated_at). Without it, the partner wins conflicts.
     */
    modifie_le?: string;
};
export type EtatEchange = {
    champs: Record<string, unknown>;
    liens: Record<string, Lien>;
    /**
     * `modifie_le` of the change that brought each field or link.
     */
    dates: Record<string, string>;
};
export type Conflit = {
    nom: string;
    lien: boolean;
    local: unknown;
    recu: unknown;
    /**
     * The most recent change. The other value is to be shown (Inbox, note).
     */
    gagnant: 'local' | 'recu';
    local_le: string | null;
    recu_le: string;
};
export type Fusion = {
    /**
     * What to write into the
     * local record (null: nothing). When there is no local record, the whole record as now known.
     */
    appliquer: {
        champs: Record<string, unknown>;
        liens: Record<string, Lien>;
    } | null;
    /**
     * The new last exchanged state to store; null after a deletion.
     */
    etat: EtatEchange | null;
    conflits: Conflit[];
    /**
     * The partner deleted the record: never delete it here alone, detach it from the share and ask.
     */
    suppression: boolean;
};
/** @type {Readonly<Record<ObjetCrm, DefinitionObjet>>} */
export declare const MODELE_CRM: Readonly<Record<ObjetCrm, DefinitionObjet>>;
/**
 * Reference of a shared record: the node it was created on, then its id there.
 * @param {string} noeud
 * @param {string} id
 */
export declare function reference(noeud: string, id: string): string;
/**
 * Splits a reference, so the OS of origin recognizes its own node and finds its record back.
 * @param {string} ref
 * @returns {{ noeud: string, id: string }}
 */
export declare function lireReference(ref: string): {
    noeud: string;
    id: string;
};
/**
 * Format problems of a batch (body of a `donnee` envelope); empty when valid. Used by `verifier('donnee', …)`.
 * @param {Record<string, any>} l
 * @returns {string[]}
 */
export declare function verifierLot(l: Record<string, any>): string[];
/**
 * One change of a shared record, validated: throws ErreurFormat on an object, field or link the
 * profile does not know (internal fields never travel), a value of the wrong type, or a change too
 * big for any batch.
 * @param {{ objet: ObjetCrm, ref: string, action?: ActionCrm, modifie_le?: string, champs?: Record<string, unknown>, liens?: Record<string, Lien> }} options
 * @returns {Changement}
 */
export declare function changement({ objet, ref, action, modifie_le, champs, liens }: {
    objet: ObjetCrm;
    ref: string;
    action?: ActionCrm;
    modifie_le?: string;
    champs?: Record<string, unknown>;
    liens?: Record<string, Lien>;
}): Changement;
/**
 * A batch of changes, the body of a `donnee` envelope. When the changes may not fit, use `decouper`.
 * @param {{ changements: Changement[], instantane?: Instantane }} options
 * @returns {Lot}
 */
export declare function lot({ changements, instantane }: {
    changements: Changement[];
    instantane?: Instantane;
}): Lot;
/**
 * Reads the body of a `donnee` envelope; throws ErreurFormat when it is not a valid crm/1 batch.
 * @param {unknown} corps
 * @returns {{ instantane: Instantane | null, changements: ChangementLu[] }}
 */
export declare function lireLot(corps: unknown): {
    instantane: Instantane | null;
    changements: ChangementLu[];
};
/**
 * Splits changes into batches under TAILLE_LOT_MAX, to post in this order. Changes are grouped by
 * object in the order of OBJETS_CRM (a record after the ones it links to), keeping their order
 * within an object. With `instantane`, the batches are the pages of the initial snapshot: one empty
 * page when nothing is shared.
 * @param {Changement[]} changements
 * @param {{ instantane?: boolean | string }} [options] `true`, or the id of the snapshot.
 * @returns {Lot[]}
 */
export declare function decouper(changements: Changement[], { instantane }?: {
    instantane?: boolean | string;
}): Lot[];
/**
 * What to send for one record: its fields and links that differ from the last exchanged state.
 * @param {EtatEchange | null | undefined} dernierEtat null for a record never exchanged.
 * @param {Fiche} fiche
 * @returns {{ champs: Record<string, unknown>, liens: Record<string, Lien> } | null} null when nothing changed.
 */
export declare function difference(dernierEtat: EtatEchange | null | undefined, fiche: Fiche): {
    champs: Record<string, unknown>;
    liens: Record<string, Lien>;
} | null;
/**
 * The last exchanged state once a change has been sent: store it in place of the previous one, so
 * the same values are not sent again.
 * @param {EtatEchange | null | undefined} dernierEtat
 * @param {Changement} changement
 * @returns {EtatEchange | null} null after a deletion: the record leaves the share.
 */
export declare function retenir(dernierEtat: EtatEchange | null | undefined, changement: Changement): EtatEchange | null;
/**
 * Merges a received change into one record. A field changed on one side only takes the new value.
 * The same field changed on both sides since the last exchange is a conflict: the most recent
 * change (`modifie_le`) wins on both sides, and the side that holds both values reports it. Received
 * values go into the exchanged state, so they are not sent back.
 * @param {EtatEchange | null | undefined} dernierEtat
 * @param {Fiche | null | undefined} local The record here, null when there is none.
 * @param {Changement} recu
 * @returns {Fusion}
 */
export declare function fusionner(dernierEtat: EtatEchange | null | undefined, local: Fiche | null | undefined, recu: Changement): Fusion;
