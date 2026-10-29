// In-memory stand-in for the relay HTTP API, for the tests of the kit and of each OS.
// Same routes, same answers in the nominal cases; no persistence, no expiry, no size limit.

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
export function relaisSimule({ url = 'https://relais.test', cle = 'cle-de-test' } = {}) {
  /** @type {Map<string, { id: string, nom: string, carte: any, secret: string, vu_le: string | null }>} */
  const noeuds = new Map();
  /** @type {Map<string, { code: string, de: string, acceptee: boolean }>} */
  const invitations = new Map();
  /** @type {Map<string, { id: string, a: string, b: string, cree_le: string, coupee: boolean }>} */
  const connexions = new Map();
  /** @type {any[]} */
  const enveloppes = [];
  // A sequence number keeps the mailbox order stable within one millisecond.
  let sequence = 0;
  const maintenant = () => new Date().toISOString();

  const reponse = (/** @type {number} */ status, /** @type {unknown} */ corps) =>
    new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
  const erreur = (/** @type {number} */ status, /** @type {string} */ message) => reponse(status, { erreur: message });
  const vue = (/** @type {any} */ n) => ({ id: n.id, nom: n.nom, carte: n.carte ?? null, vu_le: n.vu_le });
  const code = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (o) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[o % 32]).join('');

  /** @param {string} de @param {string} a @param {string} connexion @param {string} type @param {any} corps @param {string} [id] */
  function deposer(de, a, connexion, type, corps, id = crypto.randomUUID()) {
    const e = { id, connexion, de, a, type, corps: structuredClone(corps), cree_le: maintenant(), seq: ++sequence };
    enveloppes.push(e);
    return e;
  }

  /** @param {any} c @param {string} par @param {string} raison */
  function couper(c, par, raison) {
    c.coupee = true;
    deposer(par, c.a === par ? c.b : c.a, c.id, 'connexion', { evenement: 'coupee', raison, connexion: { id: c.id } });
  }

  /** @param {any} inv @param {any} invite */
  function accepter(inv, invite) {
    inv.acceptee = true;
    const c = { id: crypto.randomUUID(), a: inv.de, b: invite.id, cree_le: maintenant(), coupee: false };
    connexions.set(c.id, c);
    deposer(invite.id, inv.de, c.id, 'connexion', {
      evenement: 'acceptee',
      invitation: inv.code,
      connexion: { id: c.id, partenaire: vue(invite), cree_le: c.cree_le },
    });
    return { id: c.id, partenaire: vue(noeuds.get(inv.de)), cree_le: c.cree_le };
  }

  /** @param {string} cod */
  function invitationValide(cod) {
    const inv = invitations.get(cod);
    if (!inv || !noeuds.has(inv.de)) return erreur(404, 'invitation inconnue');
    if (inv.acceptee) return erreur(409, 'invitation déjà utilisée');
    return inv;
  }

  /** @type {RelaisSimule} */
  const relais = {
    url,
    panne: false,
    noeuds,
    enveloppes,
    async fetch(entree, init = {}) {
      if (relais.panne) throw new TypeError('fetch failed');
      const u = new URL(String(entree));
      const methode = init.method ?? 'GET';
      const corps = init.body ? JSON.parse(String(init.body)) : {};
      const chemin = u.pathname;

      if (methode === 'GET' && chemin === '/sante') return reponse(200, { ok: true });
      if (methode === 'POST' && chemin === '/noeuds') {
        if (!corps.nom) return erreur(400, 'nom requis');
        const n = { id: crypto.randomUUID(), nom: corps.nom, carte: corps.carte ?? null, secret: crypto.randomUUID(), vu_le: null };
        if (corps.cle_inscription !== undefined) {
          if (corps.cle_inscription !== cle) return erreur(403, "clé d'inscription refusée");
          noeuds.set(n.id, n);
          return reponse(201, { id: n.id, secret: n.secret });
        }
        if (corps.invitation !== undefined) {
          const inv = invitationValide(corps.invitation);
          if (inv instanceof Response) return inv;
          noeuds.set(n.id, n);
          return reponse(201, { id: n.id, secret: n.secret, connexion: accepter(inv, n) });
        }
        return erreur(403, "clé d'inscription ou invitation requise");
      }

      const auth = /^Bearer ([^.]+)\.(.+)$/.exec(new Headers(init.headers).get('authorization') ?? '');
      const moi = auth ? noeuds.get(auth[1]) : undefined;
      if (!moi || !auth || moi.secret !== auth[2]) return erreur(401, 'identifiants refusés');
      moi.vu_le = new Date().toISOString();
      const mesConnexions = () => [...connexions.values()].filter((c) => !c.coupee && (c.a === moi.id || c.b === moi.id));
      let m;

      if (methode === 'GET' && chemin === '/noeuds/moi') return reponse(200, { id: moi.id, nom: moi.nom, carte: moi.carte });
      if (methode === 'PUT' && chemin === '/noeuds/moi/carte') {
        moi.carte = corps;
        return reponse(200, { ok: true });
      }
      if (methode === 'DELETE' && chemin === '/noeuds/moi') {
        for (const c of mesConnexions()) couper(c, moi.id, 'desinscription');
        noeuds.delete(moi.id);
        return reponse(200, { ok: true });
      }
      if (methode === 'POST' && chemin === '/invitations') {
        const inv = { code: code(), de: moi.id, acceptee: false };
        invitations.set(inv.code, inv);
        return reponse(201, { code: inv.code, lien: `${url}/invitations/${inv.code}`, expire_le: new Date(Date.now() + 7 * 86_400_000).toISOString() });
      }
      if (methode === 'POST' && (m = /^\/invitations\/([^/]+)\/accepter$/.exec(chemin))) {
        const inv = invitationValide(m[1]);
        if (inv instanceof Response) return inv;
        if (inv.de === moi.id) return erreur(400, "impossible d'accepter sa propre invitation");
        return reponse(201, { connexion: accepter(inv, moi) });
      }
      if (methode === 'GET' && chemin === '/connexions') {
        return reponse(200, {
          connexions: mesConnexions().map((c) => ({ id: c.id, cree_le: c.cree_le, partenaire: vue(noeuds.get(c.a === moi.id ? c.b : c.a)) })),
        });
      }
      if (methode === 'DELETE' && (m = /^\/connexions\/([^/]+)$/.exec(chemin))) {
        const c = connexions.get(m[1]);
        if (!c || (c.a !== moi.id && c.b !== moi.id)) return erreur(404, 'connexion inconnue');
        if (c.coupee) return erreur(409, 'connexion déjà coupée');
        couper(c, moi.id, 'coupee');
        return reponse(200, { ok: true });
      }
      if (methode === 'POST' && chemin === '/envois') {
        const c = connexions.get(corps.connexion);
        if (!c || (c.a !== moi.id && c.b !== moi.id) || c.coupee) return erreur(403, 'connexion inconnue');
        const existante = corps.id && enveloppes.find((e) => e.id === corps.id);
        if (existante) return reponse(200, { id: existante.id, cree_le: existante.cree_le });
        const e = deposer(moi.id, c.a === moi.id ? c.b : c.a, c.id, corps.type, corps.corps, corps.id);
        return reponse(201, { id: e.id, cree_le: e.cree_le });
      }
      if (methode === 'GET' && chemin === '/boite') {
        const apres = Number(u.searchParams.get('apres') ?? 0);
        const suivantes = enveloppes.filter((e) => e.a === moi.id && e.seq > apres).sort((x, y) => x.seq - y.seq);
        const page = suivantes.slice(0, 100);
        const derniere = page.at(-1);
        return reponse(200, {
          enveloppes: page.map(({ seq, ...e }) => structuredClone(e)),
          curseur: derniere ? String(derniere.seq) : u.searchParams.get('apres'),
          suite: suivantes.length > 100,
        });
      }
      if (methode === 'POST' && chemin === '/boite/acquitter') {
        let n = 0;
        for (const id of corps.ids ?? []) {
          const i = enveloppes.findIndex((e) => e.id === id && e.a === moi.id);
          if (i >= 0) {
            enveloppes.splice(i, 1);
            n++;
          }
        }
        return reponse(200, { acquittees: n });
      }
      return erreur(404, 'introuvable');
    },
  };
  return relais;
}
