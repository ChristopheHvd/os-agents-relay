/**
 * @typedef {object} OptionsClient
 * @property {string} url Relay base URL, e.g. https://relais.alpes-ia.fr
 * @property {string} [noeud] Node id, once registered.
 * @property {string} [secret] Node secret, once registered.
 * @property {typeof fetch} [fetch] Injected fetch (tests).
 */

/**
 * @typedef {object} Partenaire
 * @property {string} id
 * @property {string} nom
 * @property {Record<string, unknown> | null} carte
 * @property {string | null} vu_le
 */

/**
 * @typedef {object} Connexion
 * @property {string} id
 * @property {string} cree_le
 * @property {Partenaire} partenaire
 */

/** @typedef {'mission' | 'etat' | 'message' | 'donnee' | 'connexion'} TypeEnveloppe */

/**
 * @typedef {object} Enveloppe
 * @property {string} id
 * @property {string} connexion
 * @property {string} de Sender node id, or `relais` for notices from the relay itself.
 * @property {string} a
 * @property {TypeEnveloppe} type
 * @property {Record<string, any>} corps
 * @property {string} cree_le
 */

/**
 * @typedef {object} Inscription
 * @property {string} id
 * @property {string} secret Shown once: store it.
 * @property {Connexion} [connexion] Present when registering with an invitation.
 */

/**
 * @typedef {object} Invitation
 * @property {string} code
 * @property {string} lien
 * @property {string} expire_le
 */

/**
 * @typedef {object} Boite
 * @property {Enveloppe[]} enveloppes
 * @property {string | null} curseur
 * @property {boolean} suite
 */

export class ErreurRelais extends Error {
  /**
   * @param {number} status HTTP status, 0 when the relay could not be reached.
   * @param {string} message
   * @param {unknown} [corps]
   */
  constructor(status, message, corps) {
    super(message);
    this.name = 'ErreurRelais';
    this.status = status;
    this.corps = corps;
  }

  /** Worth retrying later (network, timeout, rate limit, server error). */
  get passagere() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

const CODE = /^[A-Z2-7]{24}$/;

/**
 * Accepts an invitation link (https://relais.example/invitations/CODE) or a bare code.
 * @param {string} lienOuCode
 * @returns {{ code: string, relais: string | null }}
 */
export function lireInvitation(lienOuCode) {
  const texte = String(lienOuCode ?? '').trim();
  if (CODE.test(texte)) return { code: texte, relais: null };
  let url;
  try {
    url = new URL(texte);
  } catch {
    throw new ErreurRelais(400, "lien d'invitation invalide");
  }
  const m = /\/invitations\/([A-Z2-7]{24})\/?$/.exec(url.pathname);
  if (!m || !/^https?:$/.test(url.protocol)) throw new ErreurRelais(400, "lien d'invitation invalide");
  return { code: m[1], relais: url.origin };
}

/** @param {string} texte */
export const estLienInvitation = (texte) => {
  try {
    return lireInvitation(texte).relais !== null;
  } catch {
    return false;
  }
};

/**
 * Client for the relay HTTP API. Holds the node identity once registered.
 * @param {OptionsClient} options
 */
export function creerClient({ url, noeud, secret, fetch: fetchInjecte }) {
  const base = String(url).replace(/\/+$/, '');
  const faireFetch = fetchInjecte ?? globalThis.fetch;
  let id = noeud;
  let cle = secret;

  /**
   * @param {string} methode
   * @param {string} chemin
   * @param {{ corps?: unknown, auth?: boolean }} [options]
   * @returns {Promise<any>}
   */
  async function appel(methode, chemin, { corps, auth = true } = {}) {
    /** @type {Record<string, string>} */
    const headers = { accept: 'application/json' };
    if (corps !== undefined) headers['content-type'] = 'application/json';
    if (auth) {
      if (!id || !cle) throw new ErreurRelais(401, 'identité du nœud manquante');
      headers.authorization = `Bearer ${id}.${cle}`;
    }
    let res;
    try {
      res = await faireFetch(base + chemin, {
        method: methode,
        headers,
        body: corps === undefined ? undefined : JSON.stringify(corps),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErreurRelais(0, `relais injoignable : ${e instanceof Error ? e.message : e}`);
    }
    const texte = await res.text();
    let json = null;
    try {
      json = texte ? JSON.parse(texte) : null;
    } catch {
      // Non-JSON answer (proxy error page): keep the status, drop the body.
    }
    if (!res.ok) throw new ErreurRelais(res.status, json?.erreur ?? `HTTP ${res.status}`, json);
    return json;
  }

  /** @param {string} lienOuCode */
  function codeDuRelais(lienOuCode) {
    const { code, relais } = lireInvitation(lienOuCode);
    if (relais && relais !== new URL(base).origin) {
      throw new ErreurRelais(400, `cette invitation vient d'un autre relais (${relais})`);
    }
    return code;
  }

  return {
    url: base,
    get noeud() {
      return id;
    },
    get secret() {
      return cle;
    },
    get inscrit() {
      return Boolean(id && cle);
    },

    /** @returns {Promise<{ ok: boolean }>} */
    sante: () => appel('GET', '/sante', { auth: false }),

    /**
     * Registers this node, with the relay registration key or an invitation (link or code).
     * @param {{ nom: string, carte?: Record<string, unknown>, cle_inscription?: string, invitation?: string }} options
     * @returns {Promise<Inscription>}
     */
    async inscrire({ nom, carte, cle_inscription, invitation }) {
      const corps = { nom, carte, cle_inscription, invitation: invitation ? codeDuRelais(invitation) : undefined };
      /** @type {Inscription} */
      const r = await appel('POST', '/noeuds', { corps, auth: false });
      id = r.id;
      cle = r.secret;
      return r;
    },

    /** @returns {Promise<{ id: string, nom: string, carte: Record<string, unknown> | null, cree_le: string }>} */
    moi: () => appel('GET', '/noeuds/moi'),

    /** @param {Record<string, unknown>} carte */
    publierCarte: (carte) => appel('PUT', '/noeuds/moi/carte', { corps: carte }),

    /** Unregisters the node: its connections are cut and partners are notified. */
    desinscrire: () => appel('DELETE', '/noeuds/moi'),

    /**
     * @param {{ email?: string }} [options]
     * @returns {Promise<Invitation>}
     */
    inviter: ({ email } = {}) => appel('POST', '/invitations', { corps: email ? { email } : {} }),

    /**
     * @param {string} lienOuCode
     * @returns {Promise<{ connexion: Connexion }>}
     */
    accepter: async (lienOuCode) => appel('POST', `/invitations/${codeDuRelais(lienOuCode)}/accepter`),

    /**
     * Joins through an invitation: accepts it when registered, otherwise registers with it.
     * @param {{ lien: string, nom: string, carte?: Record<string, unknown> }} options
     * @returns {Promise<{ connexion: Connexion, inscription?: Inscription }>}
     */
    async rejoindre({ lien, nom, carte }) {
      if (id && cle) return this.accepter(lien);
      const inscription = await this.inscrire({ nom, carte, invitation: lien });
      return { connexion: /** @type {Connexion} */ (inscription.connexion), inscription };
    },

    /** @returns {Promise<Connexion[]>} */
    connexions: async () => (await appel('GET', '/connexions')).connexions,

    /** @param {string} connexion */
    couper: (connexion) => appel('DELETE', `/connexions/${encodeURIComponent(connexion)}`),

    /**
     * Posts one envelope. Passing the same `id` again is a safe retry.
     * @param {{ connexion: string, type: TypeEnveloppe, corps: Record<string, unknown>, id?: string }} enveloppe
     * @returns {Promise<{ id: string, cree_le: string }>}
     */
    envoyer: ({ connexion, type, corps, id: idEnveloppe }) =>
      appel('POST', '/envois', { corps: { id: idEnveloppe, connexion, type, corps } }),

    /**
     * @param {string | null} [apres] Cursor from the previous page.
     * @returns {Promise<Boite>}
     */
    boite: (apres) => appel('GET', `/boite${apres ? `?apres=${encodeURIComponent(apres)}` : ''}`),

    /**
     * @param {string[]} ids
     * @returns {Promise<{ acquittees: number }>}
     */
    acquitter: (ids) => appel('POST', '/boite/acquitter', { corps: { ids } }),
  };
}

/** @typedef {ReturnType<typeof creerClient>} Client */
