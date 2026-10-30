// Profile crm/1: the shared sales follow-up, in the objects and fields of the SIMATIS OS CRM.
// A `donnee` envelope carries one batch of changes. Each OS keeps, per shared record, the state
// last exchanged with the partner: it sends only what differs, and settles crossed changes with it.
// a2a.js and this module import each other; neither uses the other while loading.

import { ErreurFormat, valider } from './a2a.js';

export const PROFIL_CRM = 'crm/1';
/** UTF-8 bytes of a batch: the relay takes 256 KiB per envelope, 1 KiB is left for the envelope itself. */
export const TAILLE_LOT_MAX = 255 * 1024;
// Bytes of a batch around its changes, snapshot marker included.
const ENTETE_MAX = 256;

/** Also the sending order: a record comes after the ones it links to. */
export const OBJETS_CRM = /** @type {const} */ (['pipeline', 'entreprise', 'contact', 'affaire', 'tache', 'rendez_vous', 'activite']);
export const CRITERES_QUALIFICATION = /** @type {const} */ (['besoin', 'decideur', 'budget', 'timing', 'engagement']);
/** Deal fields shared only when Marc decides so, connection by connection. */
export const CHAMPS_QUALIFICATION = /** @type {const} */ (['qualification', 'potentiel', 'faisabilite']);

/** @typedef {(typeof OBJETS_CRM)[number]} ObjetCrm */
/** @typedef {'maj' | 'supprime'} ActionCrm */
/** @typedef {'texte' | 'entier' | 'pourcentage' | 'booleen' | 'date' | 'horodatage' | 'textes' | 'qualification' | 'dates_etapes' | 'etapes'} TypeSimple */
/** @typedef {TypeSimple | readonly string[]} TypeChamp A type, or the list of the allowed values. */
/** @typedef {{ vers: ObjetCrm, multiple: boolean }} TypeLien */
/**
 * @typedef {object} DefinitionObjet
 * @property {Readonly<Record<string, TypeChamp>>} champs
 * @property {readonly string[]} obligatoires Never emptied.
 * @property {Readonly<Record<string, TypeLien>>} liens
 */
/** @typedef {string | string[] | null} Lien One reference, or the list of them with the main one first. */

/**
 * @typedef {object} Changement One change of a shared record.
 * @property {ObjetCrm} objet
 * @property {string} ref `<origin node>/<local id>`, stable.
 * @property {ActionCrm} action `maj` creates the record when missing. `supprime` never deletes it on the other side by itself.
 * @property {string} modifie_le
 * @property {Record<string, unknown>} [champs] Only the changed fields; null empties one, a field left out does not change.
 * @property {Record<string, Lien>} [liens] The whole list of a link that changed.
 */
/** @typedef {Changement & { champs: Record<string, unknown>, liens: Record<string, Lien> }} ChangementLu */
/** @typedef {{ id: string, page: number, pages: number }} Instantane Only in the batches of the initial snapshot. */
/**
 * @typedef {object} Lot Body of a `donnee` envelope.
 * @property {typeof PROFIL_CRM} profil
 * @property {Changement[]} changements
 * @property {Instantane} [instantane]
 */

/**
 * @typedef {object} Fiche A shared record as the OS holds it now, in the profile's fields.
 * @property {Record<string, unknown>} [champs] A field left out is not shared (nothing changes on the other side); null empties it.
 * @property {Record<string, Lien>} [liens]
 * @property {string} [modifie_le] Last change of the record (updated_at). Without it, the partner wins conflicts.
 */
/**
 * @typedef {object} EtatEchange What the partner holds of one record, as last sent or received. The OS stores it as is.
 * @property {Record<string, unknown>} champs
 * @property {Record<string, Lien>} liens
 * @property {Record<string, string>} dates `modifie_le` of the change that brought each field or link.
 */
/**
 * @typedef {object} Conflit The same field or link changed on both sides since the last exchange.
 * @property {string} nom
 * @property {boolean} lien
 * @property {unknown} local
 * @property {unknown} recu
 * @property {'local' | 'recu'} gagnant The most recent change. The other value is to be shown (Inbox, note).
 * @property {string | null} local_le
 * @property {string} recu_le
 */
/**
 * @typedef {object} Fusion
 * @property {{ champs: Record<string, unknown>, liens: Record<string, Lien> } | null} appliquer What to write into the
 *   local record (null: nothing). When there is no local record, the whole record as now known.
 * @property {EtatEchange | null} etat The new last exchanged state to store; null after a deletion.
 * @property {Conflit[]} conflits
 * @property {boolean} suppression The partner deleted the record: never delete it here alone, detach it from the share and ask.
 */

/** @param {ObjetCrm} objet */
const un = (objet) => ({ vers: objet, multiple: false });
/** @param {ObjetCrm} objet */
const plusieurs = (objet) => ({ vers: objet, multiple: true });

/** @type {Readonly<Record<ObjetCrm, DefinitionObjet>>} */
export const MODELE_CRM = {
  pipeline: { champs: { etapes: 'etapes' }, obligatoires: ['etapes'], liens: {} },
  entreprise: {
    champs: { nom: 'texte', secteur: 'texte', ville: 'texte', taille: 'entier', domaine: 'texte' },
    obligatoires: ['nom'],
    liens: {},
  },
  contact: {
    champs: { nom: 'texte', fonction: 'texte', email: 'texte', emails: 'textes', telephone: 'texte', role: 'texte' },
    obligatoires: ['nom'],
    liens: { entreprises: plusieurs('entreprise') },
  },
  affaire: {
    champs: {
      titre: 'texte',
      etape: 'texte',
      montant: 'entier',
      echeance: 'date',
      clos: ['gagne', 'perdu'],
      motif: 'texte',
      proprietaire: 'texte',
      origine: 'texte',
      prochaine_etape: 'texte',
      mode_facturation: ['spot', 'recurrent'],
      duree_engagement_mois: 'entier',
      tacite_reconduction: 'booleen',
      probabilite_manuelle: 'pourcentage',
      derniere_activite: 'horodatage',
      etapes_dates: 'dates_etapes',
      qualification: 'qualification',
      potentiel: 'texte',
      faisabilite: 'texte',
    },
    obligatoires: ['titre', 'etape'],
    liens: { contacts: plusieurs('contact'), entreprises: plusieurs('entreprise') },
  },
  tache: {
    champs: {
      titre: 'texte',
      type: ['appel', 'email', 'tache', 'reunion', 'echeance', 'dejeuner'],
      echeance: 'horodatage',
      avec_heure: 'booleen',
      duree_minutes: 'entier',
      occupe: 'booleen',
      fait_at: 'horodatage',
      notes: 'texte',
    },
    obligatoires: ['titre', 'type'],
    liens: { contact: un('contact'), entreprise: un('entreprise'), affaire: un('affaire') },
  },
  rendez_vous: {
    champs: { titre: 'texte', debut: 'horodatage', fin: 'horodatage', lieu: 'texte', compte_rendu: 'texte', compte_rendu_at: 'horodatage' },
    obligatoires: ['titre', 'debut'],
    liens: { contacts: plusieurs('contact'), entreprises: plusieurs('entreprise'), affaires: plusieurs('affaire') },
  },
  activite: {
    champs: { type: ['note', 'appel', 'email', 'reunion'], at: 'horodatage', titre: 'texte', resume: 'texte' },
    obligatoires: ['type', 'at'],
    liens: { contact: un('contact'), entreprise: un('entreprise'), affaire: un('affaire') },
  },
};

const REFERENCE = /^[^/\s]+\/\S+$/;
const EXTENSION = /^x_[a-z0-9_]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const CLES_LOT = ['profil', 'changements', 'instantane'];
const CLES_CHANGEMENT = ['objet', 'ref', 'action', 'modifie_le', 'champs', 'liens'];
const CLES_ETAPE = ['id', 'libelle', 'ordre', 'clos', 'gagne', 'probabilite'];

const maintenant = () => new Date().toISOString();
const encodeur = new TextEncoder();
/** @param {unknown} v */
const octets = (v) => encodeur.encode(JSON.stringify(v)).length;

/** @param {unknown} v @returns {v is Record<string, any>} */
const estObjet = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v @returns {v is string} */
const estReference = (v) => typeof v === 'string' && v.length <= 256 && REFERENCE.test(v);
/** @param {unknown} v */
const estDate = (v) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v));
/** @param {unknown} v */
const estHorodatage = (v) => typeof v === 'string' && HORODATAGE.test(v) && !Number.isNaN(Date.parse(v));
/** @param {unknown} v */
const estPourcentage = (v) => typeof v === 'number' && v >= 0 && v <= 100;
/** @param {Readonly<Record<string, any>>} o @param {string} cle */
const propre = (o, cle) => (Object.hasOwn(o, cle) ? o[cle] : undefined);

// ---------------------------------------------------------------- references

/**
 * Reference of a shared record: the node it was created on, then its id there.
 * @param {string} noeud
 * @param {string} id
 */
export function reference(noeud, id) {
  const ref = `${noeud}/${id}`;
  if (/[/\s]/.test(String(noeud)) || !estReference(ref)) throw new ErreurFormat([`référence invalide : ${ref}`]);
  return ref;
}

/**
 * Splits a reference, so the OS of origin recognizes its own node and finds its record back.
 * @param {string} ref
 * @returns {{ noeud: string, id: string }}
 */
export function lireReference(ref) {
  if (!estReference(ref)) throw new ErreurFormat([`référence invalide : ${ref}`]);
  const i = ref.indexOf('/');
  return { noeud: ref.slice(0, i), id: ref.slice(i + 1) };
}

// ---------------------------------------------------------------- validation

/**
 * @param {TypeChamp} type
 * @param {unknown} v Neither null nor undefined.
 * @returns {string | null}
 */
function problemeValeur(type, v) {
  if (typeof type !== 'string') return type.includes(/** @type {string} */ (v)) ? null : `un de ${type.join(', ')}`;
  switch (type) {
    case 'texte':
      return typeof v === 'string' ? null : 'texte attendu';
    case 'entier':
      return Number.isSafeInteger(v) ? null : 'entier attendu';
    case 'pourcentage':
      return Number.isInteger(v) && estPourcentage(v) ? null : 'entier de 0 à 100 attendu';
    case 'booleen':
      return typeof v === 'boolean' ? null : 'booléen attendu';
    case 'date':
      return estDate(v) ? null : 'date AAAA-MM-JJ attendue';
    case 'horodatage':
      return estHorodatage(v) ? null : 'horodatage ISO 8601 attendu';
    case 'textes':
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : 'liste de textes attendue';
    case 'qualification':
      if (!estObjet(v)) return `objet attendu (${CRITERES_QUALIFICATION.join(', ')})`;
      for (const [cle, note] of Object.entries(v)) {
        if (!(/** @type {readonly string[]} */ (CRITERES_QUALIFICATION)).includes(cle)) return `critère inconnu : ${cle}`;
        if (!Number.isInteger(note)) return `${cle} : entier attendu`;
      }
      return null;
    case 'dates_etapes':
      if (!estObjet(v)) return 'objet { étape: date } attendu';
      for (const [cle, quand] of Object.entries(v)) {
        if (!estDate(quand) && !estHorodatage(quand)) return `${cle} : date ou horodatage attendu`;
      }
      return null;
    case 'etapes': {
      if (!Array.isArray(v)) return "liste d'étapes attendue";
      const ids = new Set();
      for (const [i, e] of v.entries()) {
        const ou = `étape ${i + 1}`;
        if (!estObjet(e)) return `${ou} : objet attendu`;
        const inconnue = Object.keys(e).find((cle) => !CLES_ETAPE.includes(cle));
        if (inconnue) return `${ou} : clé inconnue ${inconnue}`;
        if (typeof e.id !== 'string' || !e.id) return `${ou} : id manquant`;
        if (ids.has(e.id)) return `${ou} : id ${e.id} en double`;
        ids.add(e.id);
        if (typeof e.libelle !== 'string') return `${ou} : libelle manquant`;
        if (!Number.isFinite(e.ordre)) return `${ou} : ordre (nombre) manquant`;
        if (typeof e.clos !== 'boolean' || typeof e.gagne !== 'boolean') return `${ou} : clos et gagne (booléens) attendus`;
        if (e.probabilite != null && !estPourcentage(e.probabilite)) return `${ou} : probabilite de 0 à 100 attendue`;
      }
      return null;
    }
  }
}

/** @param {unknown} c @param {string} ou @param {string[]} p */
function verifierChangement(c, ou, p) {
  const o = (/** @type {string} */ s) => (ou ? `${ou}.${s}` : s);
  const lui = ou || 'changement';
  if (!estObjet(c)) return void p.push(`${lui} : objet attendu`);
  for (const cle of Object.keys(c)) if (!CLES_CHANGEMENT.includes(cle)) p.push(`${o(cle)} : clé inconnue`);
  /** @type {DefinitionObjet | undefined} */
  const def = OBJETS_CRM.includes(c.objet) ? MODELE_CRM[/** @type {ObjetCrm} */ (c.objet)] : undefined;
  if (!def) p.push(`${o('objet')} : un de ${OBJETS_CRM.join(', ')}`);
  if (!estReference(c.ref)) p.push(`${o('ref')} : référence <nœud>/<id> attendue`);
  if (c.action !== 'maj' && c.action !== 'supprime') p.push(`${o('action')} : "maj" ou "supprime" attendu`);
  if (!estHorodatage(c.modifie_le)) p.push(`${o('modifie_le')} : horodatage ISO 8601 attendu`);
  if (c.champs !== undefined && !estObjet(c.champs)) return void p.push(`${o('champs')} : objet attendu`);
  if (c.liens !== undefined && !estObjet(c.liens)) return void p.push(`${o('liens')} : objet attendu`);
  const champs = Object.entries(c.champs ?? {});
  const liens = Object.entries(c.liens ?? {});
  if (c.action === 'supprime') {
    if (champs.length || liens.length) p.push(`${lui} : une suppression ne porte ni champ ni lien`);
    return;
  }
  if (!champs.length && !liens.length) p.push(`${lui} : une mise à jour porte au moins un champ ou un lien`);
  if (!def) return;
  for (const [nom, v] of champs) {
    const ici = o(`champs.${nom}`);
    const type = nom.startsWith('x_') ? null : propre(def.champs, nom);
    if (type === undefined) p.push(`${ici} : champ inconnu pour ${c.objet}`);
    else if (type === null && !EXTENSION.test(nom)) p.push(`${ici} : nom de champ propre invalide (x_ puis minuscules, chiffres, _)`);
    else if (v === undefined) p.push(`${ici} : valeur manquante (null pour vider)`);
    else if (v === null) {
      if (def.obligatoires.includes(nom)) p.push(`${ici} : obligatoire, ne peut pas être vidé`);
    } else if (type !== null) {
      const probleme = problemeValeur(type, v);
      if (probleme) p.push(`${ici} : ${probleme}`);
    }
  }
  for (const [nom, v] of liens) {
    const ici = o(`liens.${nom}`);
    /** @type {TypeLien | undefined} */
    const lien = propre(def.liens, nom);
    if (!lien) p.push(`${ici} : lien inconnu pour ${c.objet}`);
    else if (lien.multiple) {
      if (!Array.isArray(v) || !v.every(estReference)) p.push(`${ici} : liste de références attendue`);
      else if (new Set(v).size !== v.length) p.push(`${ici} : référence en double`);
    } else if (v !== null && !estReference(v)) p.push(`${ici} : référence ou null attendue`);
  }
}

/** @param {unknown} s @param {string[]} p */
function verifierInstantane(s, p) {
  if (!estObjet(s)) return void p.push('instantane : objet attendu');
  for (const cle of Object.keys(s)) if (!['id', 'page', 'pages'].includes(cle)) p.push(`instantane.${cle} : clé inconnue`);
  if (typeof s.id !== 'string' || !s.id || s.id.length > 64) p.push('instantane.id manquant');
  if (!Number.isInteger(s.page) || s.page < 1) p.push('instantane.page : entier à partir de 1 attendu');
  if (!Number.isInteger(s.pages) || s.pages < s.page) p.push('instantane.pages : entier, au moins page, attendu');
}

/**
 * Format problems of a batch (body of a `donnee` envelope); empty when valid. Used by `verifier('donnee', …)`.
 * @param {Record<string, any>} l
 * @returns {string[]}
 */
export function verifierLot(l) {
  /** @type {string[]} */
  const p = [];
  for (const cle of Object.keys(l)) if (!CLES_LOT.includes(cle)) p.push(`${cle} : clé inconnue`);
  if (l.profil !== PROFIL_CRM) p.push(`profil : "${PROFIL_CRM}" attendu`);
  if (l.instantane !== undefined) verifierInstantane(l.instantane, p);
  if (!Array.isArray(l.changements)) p.push('changements : liste attendue');
  else {
    if (!l.changements.length && l.instantane === undefined) p.push('changements : au moins un (hors instantané)');
    l.changements.forEach((/** @type {unknown} */ c, /** @type {number} */ i) => verifierChangement(c, `changements[${i}]`, p));
  }
  return p;
}

// ---------------------------------------------------------------- batches

/**
 * One change of a shared record, validated: throws ErreurFormat on an object, field or link the
 * profile does not know (internal fields never travel), a value of the wrong type, or a change too
 * big for any batch.
 * @param {{ objet: ObjetCrm, ref: string, action?: ActionCrm, modifie_le?: string, champs?: Record<string, unknown>, liens?: Record<string, Lien> }} options
 * @returns {Changement}
 */
export function changement({ objet, ref, action = 'maj', modifie_le = maintenant(), champs, liens }) {
  const c = /** @type {Changement} */ ({
    objet,
    ref,
    action,
    modifie_le,
    ...(champs && Object.keys(champs).length ? { champs: structuredClone(champs) } : {}),
    ...(liens && Object.keys(liens).length ? { liens: structuredClone(liens) } : {}),
  });
  /** @type {string[]} */
  const p = [];
  verifierChangement(c, '', p);
  if (!p.length && octets(c) > TAILLE_LOT_MAX - ENTETE_MAX) p.push(`changement trop volumineux pour un lot (${objet} ${ref})`);
  if (p.length) throw new ErreurFormat(p);
  return c;
}

/**
 * A batch of changes, the body of a `donnee` envelope. When the changes may not fit, use `decouper`.
 * @param {{ changements: Changement[], instantane?: Instantane }} options
 * @returns {Lot}
 */
export function lot({ changements, instantane }) {
  const l = /** @type {Lot} */ ({ profil: PROFIL_CRM, changements, ...(instantane ? { instantane } : {}) });
  valider('donnee', l);
  const taille = octets(l);
  if (taille > TAILLE_LOT_MAX) throw new ErreurFormat([`lot trop volumineux (${taille} octets, ${TAILLE_LOT_MAX} au plus) : passer par decouper()`]);
  return l;
}

/**
 * Reads the body of a `donnee` envelope; throws ErreurFormat when it is not a valid crm/1 batch.
 * @param {unknown} corps
 * @returns {{ instantane: Instantane | null, changements: ChangementLu[] }}
 */
export function lireLot(corps) {
  valider('donnee', corps);
  const l = /** @type {Lot} */ (corps);
  return {
    instantane: l.instantane ?? null,
    changements: l.changements.map((c) => ({ ...c, champs: c.champs ?? {}, liens: c.liens ?? {} })),
  };
}

/**
 * Splits changes into batches under TAILLE_LOT_MAX, to post in this order. Changes are grouped by
 * object in the order of OBJETS_CRM (a record after the ones it links to), keeping their order
 * within an object. With `instantane`, the batches are the pages of the initial snapshot: one empty
 * page when nothing is shared.
 * @param {Changement[]} changements
 * @param {{ instantane?: boolean | string }} [options] `true`, or the id of the snapshot.
 * @returns {Lot[]}
 */
export function decouper(changements, { instantane } = {}) {
  const id = instantane === true ? crypto.randomUUID() : instantane || null;
  const rang = (/** @type {Changement} */ c) => OBJETS_CRM.indexOf(c.objet);
  const tries = [...changements].sort((x, y) => rang(x) - rang(y));
  const entete = octets({ profil: PROFIL_CRM, changements: [], ...(id ? { instantane: { id, page: 999_999, pages: 999_999 } } : {}) });
  /** @type {Changement[][]} */
  const groupes = [[]];
  let taille = entete;
  for (const c of tries) {
    const t = octets(c) + 1;
    if (entete + t > TAILLE_LOT_MAX) throw new ErreurFormat([`changement trop volumineux pour un lot (${c.objet} ${c.ref})`]);
    if (taille + t > TAILLE_LOT_MAX) {
      groupes.push([]);
      taille = entete;
    }
    groupes[groupes.length - 1].push(c);
    taille += t;
  }
  if (!id && !tries.length) return [];
  return groupes.map((g, i) => lot({ changements: g, ...(id ? { instantane: { id, page: i + 1, pages: groupes.length } } : {}) }));
}

// ---------------------------------------------------------------- synchronization

/** @returns {EtatEchange} */
const etatVide = () => ({ champs: {}, liens: {}, dates: {} });
/** @param {EtatEchange | null | undefined} e @returns {EtatEchange} */
const copieEtat = (e) => (e ? structuredClone({ champs: e.champs ?? {}, liens: e.liens ?? {}, dates: e.dates ?? {} }) : etatVide());
/** @param {unknown} v */
const vide = (v) => v == null || (Array.isArray(v) && v.length === 0);

/**
 * Same value whatever the key order; two timestamps of the same instant are equal.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function egal(a, b) {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') return estHorodatage(a) && estHorodatage(b) && Date.parse(a) === Date.parse(b);
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => egal(x, b[i]));
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && egal(a[k], b[k]));
}

/** Null, absent and an empty list all mean "nothing". @param {unknown} a @param {unknown} b */
const memeValeur = (a, b) => (vide(a) && vide(b)) || egal(a, b);

/**
 * @param {EtatEchange} etat
 * @param {'champs' | 'liens'} cle
 * @param {string} nom
 * @param {unknown} v
 * @param {string} quand
 */
function noter(etat, cle, nom, v, quand) {
  /** @type {Record<string, any>} */ (etat[cle])[nom] = structuredClone(v);
  etat.dates[nom] = quand;
}

/**
 * What to send for one record: its fields and links that differ from the last exchanged state.
 * @param {EtatEchange | null | undefined} dernierEtat null for a record never exchanged.
 * @param {Fiche} fiche
 * @returns {{ champs: Record<string, unknown>, liens: Record<string, Lien> } | null} null when nothing changed.
 */
export function difference(dernierEtat, fiche) {
  const avant = dernierEtat ?? etatVide();
  /** @type {Record<string, unknown>} */
  const champs = {};
  /** @type {Record<string, Lien>} */
  const liens = {};
  for (const [nom, v] of Object.entries(fiche.champs ?? {})) {
    if (v !== undefined && !memeValeur(propre(avant.champs ?? {}, nom), v)) champs[nom] = v;
  }
  for (const [nom, v] of Object.entries(fiche.liens ?? {})) {
    const ancien = propre(avant.liens ?? {}, nom);
    if (v !== undefined && !memeValeur(ancien, v)) liens[nom] = v === null && Array.isArray(ancien) ? [] : v;
  }
  return Object.keys(champs).length || Object.keys(liens).length ? { champs, liens } : null;
}

/**
 * The last exchanged state once a change has been sent: store it in place of the previous one, so
 * the same values are not sent again.
 * @param {EtatEchange | null | undefined} dernierEtat
 * @param {Changement} changement
 * @returns {EtatEchange | null} null after a deletion: the record leaves the share.
 */
export function retenir(dernierEtat, changement) {
  if (changement.action === 'supprime') return null;
  const etat = copieEtat(dernierEtat);
  for (const [nom, v] of Object.entries(changement.champs ?? {})) noter(etat, 'champs', nom, v, changement.modifie_le);
  for (const [nom, v] of Object.entries(changement.liens ?? {})) noter(etat, 'liens', nom, v, changement.modifie_le);
  return etat;
}

/**
 * The received change wins when it is more recent; at the same instant, the same value wins on both sides.
 * @param {string} recuLe
 * @param {unknown} recu
 * @param {string | null} localLe
 * @param {unknown} local
 */
function recuGagne(recuLe, recu, localLe, local) {
  const r = Date.parse(recuLe);
  const l = localLe ? Date.parse(localLe) : -Infinity;
  if (r !== l) return r > l;
  return JSON.stringify(recu ?? null) > JSON.stringify(local ?? null);
}

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
export function fusionner(dernierEtat, local, recu) {
  if (recu.action === 'supprime') return { appliquer: null, etat: null, conflits: [], suppression: true };
  const avant = copieEtat(dernierEtat);
  const etat = copieEtat(dernierEtat);
  const ici = (local && difference(dernierEtat, local)) ?? { champs: {}, liens: {} };
  /** @type {{ champs: Record<string, any>, liens: Record<string, any> }} */
  const appliquer = { champs: {}, liens: {} };
  /** @type {Conflit[]} */
  const conflits = [];
  for (const cle of /** @type {const} */ (['champs', 'liens'])) {
    for (const [nom, vRecu] of Object.entries(recu[cle] ?? {})) {
      const changeIci = Object.hasOwn(ici[cle], nom);
      const vLocal = changeIci ? propre(ici[cle], nom) : propre(avant[cle], nom);
      const localLe = (changeIci ? local?.modifie_le : propre(avant.dates, nom)) ?? null;
      if (memeValeur(vLocal, vRecu)) {
        noter(etat, cle, nom, vRecu, localLe && Date.parse(localLe) > Date.parse(recu.modifie_le) ? localLe : recu.modifie_le);
        continue;
      }
      const gagne = recuGagne(recu.modifie_le, vRecu, localLe, vLocal);
      // Not changed here but losing: the change crossed a more recent one of ours, already on its way.
      if (changeIci || !gagne) {
        conflits.push({ nom, lien: cle === 'liens', local: vLocal, recu: vRecu, gagnant: gagne ? 'recu' : 'local', local_le: localLe, recu_le: recu.modifie_le });
      }
      if (gagne) appliquer[cle][nom] = structuredClone(vRecu);
      // A local change that wins is not sent yet: the partner holds its own value until it is.
      if (gagne || changeIci) noter(etat, cle, nom, vRecu, recu.modifie_le);
    }
  }
  if (!local) return { appliquer: { champs: structuredClone(etat.champs), liens: structuredClone(etat.liens) }, etat, conflits, suppression: false };
  const rien = !Object.keys(appliquer.champs).length && !Object.keys(appliquer.liens).length;
  return { appliquer: rien ? null : appliquer, etat, conflits, suppression: false };
}
