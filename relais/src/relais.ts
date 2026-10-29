import {
  HttpError,
  TAILLE_MAX,
  codeInvitation,
  dansJours,
  decoderCurseur,
  egaux,
  encoderCurseur,
  estObjet,
  hex,
  lireCarte,
  lireJson,
  maintenant,
  secretAleatoire,
  sha256,
  uuid,
} from './lib';

type Env = Cloudflare.Env;

interface Noeud {
  id: string;
  nom: string;
  carte: string | null;
  secret_hash: string;
  cree_le: string;
  vu_le: string | null;
}

interface Invitation {
  code: string;
  de: string;
  email: string | null;
  cree_le: string;
  expire_le: string;
  acceptee_le: string | null;
  connexion: string | null;
}

interface Connexion {
  id: string;
  a: string;
  b: string;
  cree_le: string;
  coupee_le: string | null;
}

interface Contexte {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  noeud: Noeud;
}

export const TYPES = ['mission', 'etat', 'message', 'donnee', 'connexion'] as const;
const PAGE = 100;
const PETIT = 64 * 1024;
const VALIDITE_INVITATION_JOURS = 7;
const CODE_INVITATION = /^[A-Z2-7]{24}$/;
const ID_ENVELOPPE = /^[A-Za-z0-9-]{8,64}$/;

const json = (corps: unknown, status = 200): Response => Response.json(corps, { status });

const vuePartenaire = (n: Pick<Noeud, 'id' | 'nom' | 'carte' | 'vu_le'>) => ({
  id: n.id,
  nom: n.nom,
  carte: lireCarte(n.carte),
  vu_le: n.vu_le,
});

const insererEnveloppe = (env: Env) =>
  env.DB.prepare(
    'INSERT INTO enveloppes (id, connexion, de, a, type, corps, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

// ---------------------------------------------------------------- auth

const HASH_ABSENT = '0'.repeat(64);

async function authentifier(request: Request, env: Env): Promise<Noeud> {
  const m = /^Bearer\s+([^.\s]+)\.(\S+)$/.exec(request.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'authentification requise');
  const [, id, secret] = m;
  const noeud = await env.DB.prepare('SELECT * FROM noeuds WHERE id = ?').bind(id).first<Noeud>();
  // Always hash and compare, even for an unknown node, so timing does not reveal which ids exist.
  const recu = new TextEncoder().encode(hex(await sha256(secret)));
  const attendu = new TextEncoder().encode(noeud?.secret_hash ?? HASH_ABSENT);
  const ok = crypto.subtle.timingSafeEqual(recu, attendu);
  if (!ok || !noeud) throw new HttpError(401, 'identifiants refusés');
  return noeud;
}

// ---------------------------------------------------------------- nodes

async function lireInvitationValide(env: Env, code: string): Promise<Invitation> {
  if (!CODE_INVITATION.test(code)) throw new HttpError(404, 'invitation inconnue');
  const inv = await env.DB.prepare('SELECT * FROM invitations WHERE code = ?').bind(code).first<Invitation>();
  if (!inv) throw new HttpError(404, 'invitation inconnue');
  if (inv.acceptee_le) throw new HttpError(409, 'invitation déjà utilisée');
  if (inv.expire_le <= maintenant()) throw new HttpError(410, 'invitation expirée');
  return inv;
}

async function lireInviteur(env: Env, inv: Invitation): Promise<Noeud> {
  const inviteur = await env.DB.prepare('SELECT * FROM noeuds WHERE id = ?').bind(inv.de).first<Noeud>();
  if (!inviteur) throw new HttpError(404, 'invitation inconnue');
  return inviteur;
}

/**
 * Accepting an invitation must happen once, even under concurrent requests: the conditional
 * UPDATE claims the invitation, and every following INSERT only runs if that claim is ours.
 */
function accepterAtomiquement(
  env: Env,
  inv: Invitation,
  invite: Pick<Noeud, 'id' | 'nom' | 'carte' | 'vu_le'>,
  connexionId: string,
  quand: string,
  avant: D1PreparedStatement[] = [],
): D1PreparedStatement[] {
  const reclamee = 'EXISTS (SELECT 1 FROM invitations WHERE code = ? AND connexion = ?)';
  const notification = JSON.stringify({
    evenement: 'acceptee',
    invitation: inv.code,
    connexion: { id: connexionId, partenaire: vuePartenaire(invite), cree_le: quand },
  });
  return [
    env.DB.prepare(
      'UPDATE invitations SET acceptee_le = ?, connexion = ? WHERE code = ? AND acceptee_le IS NULL AND expire_le > ?',
    ).bind(quand, connexionId, inv.code, quand),
    ...avant,
    env.DB.prepare(`INSERT INTO connexions (id, a, b, cree_le) SELECT ?, ?, ?, ? WHERE ${reclamee}`).bind(
      connexionId,
      inv.de,
      invite.id,
      quand,
      inv.code,
      connexionId,
    ),
    env.DB.prepare(
      `INSERT INTO enveloppes (id, connexion, de, a, type, corps, cree_le) SELECT ?, ?, ?, ?, 'connexion', ?, ? WHERE ${reclamee}`,
    ).bind(uuid(), connexionId, invite.id, inv.de, notification, quand, inv.code, connexionId),
  ];
}

async function inscrire(request: Request, env: Env): Promise<Response> {
  const corps = await lireJson(request, PETIT);
  const nom = typeof corps.nom === 'string' ? corps.nom.trim() : '';
  if (!nom || nom.length > 200) throw new HttpError(400, 'nom requis (200 caractères au plus)');
  if (corps.carte !== undefined && !estObjet(corps.carte)) throw new HttpError(400, 'carte invalide');
  const carte = corps.carte ? JSON.stringify(corps.carte) : null;

  const id = uuid();
  const secret = secretAleatoire();
  const secretHash = hex(await sha256(secret));
  const quand = maintenant();

  if (typeof corps.cle_inscription === 'string') {
    const attendue = env.CLE_INSCRIPTION;
    if (!attendue || !(await egaux(corps.cle_inscription, attendue))) {
      throw new HttpError(403, "clé d'inscription refusée");
    }
    await env.DB.prepare('INSERT INTO noeuds (id, nom, carte, secret_hash, cree_le) VALUES (?, ?, ?, ?, ?)')
      .bind(id, nom, carte, secretHash, quand)
      .run();
    return json({ id, secret }, 201);
  }

  if (typeof corps.invitation === 'string') {
    const inv = await lireInvitationValide(env, corps.invitation);
    const inviteur = await lireInviteur(env, inv);
    const connexionId = uuid();
    const nouveau = { id, nom, carte, vu_le: null };
    const insererNoeud = env.DB.prepare(
      'INSERT INTO noeuds (id, nom, carte, secret_hash, cree_le) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM invitations WHERE code = ? AND connexion = ?)',
    ).bind(id, nom, carte, secretHash, quand, inv.code, connexionId);
    const resultats = await env.DB.batch(accepterAtomiquement(env, inv, nouveau, connexionId, quand, [insererNoeud]));
    if (resultats[0].meta.changes !== 1) throw new HttpError(409, 'invitation déjà utilisée');
    return json({ id, secret, connexion: { id: connexionId, partenaire: vuePartenaire(inviteur), cree_le: quand } }, 201);
  }

  throw new HttpError(403, "clé d'inscription ou invitation requise");
}

async function moi({ noeud }: Contexte): Promise<Response> {
  return json({ id: noeud.id, nom: noeud.nom, carte: lireCarte(noeud.carte), cree_le: noeud.cree_le });
}

async function publierCarte({ request, env, noeud }: Contexte): Promise<Response> {
  const carte = await lireJson(request, PETIT);
  await env.DB.prepare('UPDATE noeuds SET carte = ? WHERE id = ?').bind(JSON.stringify(carte), noeud.id).run();
  return json({ ok: true });
}

async function desinscrire({ env, noeud }: Contexte): Promise<Response> {
  const quand = maintenant();
  const { results: actives } = await env.DB.prepare(
    'SELECT * FROM connexions WHERE (a = ?1 OR b = ?1) AND coupee_le IS NULL',
  )
    .bind(noeud.id)
    .all<Connexion>();
  const instructions = actives.flatMap((c) => couper(env, c, noeud.id, quand, 'desinscription'));
  instructions.push(
    env.DB.prepare('DELETE FROM invitations WHERE de = ? AND acceptee_le IS NULL').bind(noeud.id),
    env.DB.prepare('DELETE FROM enveloppes WHERE a = ?').bind(noeud.id),
    env.DB.prepare('DELETE FROM noeuds WHERE id = ?').bind(noeud.id),
  );
  await env.DB.batch(instructions);
  return json({ ok: true });
}

// ---------------------------------------------------------------- invitations

async function creerInvitation({ request, env, url, noeud }: Contexte): Promise<Response> {
  const corps = await lireJson(request, PETIT);
  let email: string | null = null;
  if (corps.email !== undefined && corps.email !== null) {
    if (typeof corps.email !== 'string' || corps.email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(corps.email)) {
      throw new HttpError(400, 'e-mail invalide');
    }
    email = corps.email;
  }
  const code = codeInvitation();
  const quand = maintenant();
  const expire = dansJours(VALIDITE_INVITATION_JOURS);
  await env.DB.prepare('INSERT INTO invitations (code, de, email, cree_le, expire_le) VALUES (?, ?, ?, ?, ?)')
    .bind(code, noeud.id, email, quand, expire)
    .run();
  return json({ code, lien: `${url.origin}/invitations/${code}`, expire_le: expire }, 201);
}

async function accepterInvitation({ env, noeud }: Contexte, [code]: string[]): Promise<Response> {
  const inv = await lireInvitationValide(env, code);
  if (inv.de === noeud.id) throw new HttpError(400, "impossible d'accepter sa propre invitation");
  const inviteur = await lireInviteur(env, inv);
  const existante = await env.DB.prepare(
    'SELECT id FROM connexions WHERE coupee_le IS NULL AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))',
  )
    .bind(inv.de, noeud.id)
    .first();
  if (existante) throw new HttpError(409, 'déjà connectés');

  const connexionId = uuid();
  const quand = maintenant();
  const resultats = await env.DB.batch(accepterAtomiquement(env, inv, noeud, connexionId, quand));
  if (resultats[0].meta.changes !== 1) throw new HttpError(409, 'invitation déjà utilisée');
  return json({ connexion: { id: connexionId, partenaire: vuePartenaire(inviteur), cree_le: quand } }, 201);
}

// ---------------------------------------------------------------- connections

async function listerConnexions({ env, noeud }: Contexte): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.cree_le, n.id AS p_id, n.nom AS p_nom, n.carte AS p_carte, n.vu_le AS p_vu_le
     FROM connexions c JOIN noeuds n ON n.id = CASE WHEN c.a = ?1 THEN c.b ELSE c.a END
     WHERE (c.a = ?1 OR c.b = ?1) AND c.coupee_le IS NULL
     ORDER BY c.cree_le, c.id`,
  )
    .bind(noeud.id)
    .all<{ id: string; cree_le: string; p_id: string; p_nom: string; p_carte: string | null; p_vu_le: string | null }>();
  return json({
    connexions: results.map((r) => ({
      id: r.id,
      cree_le: r.cree_le,
      partenaire: vuePartenaire({ id: r.p_id, nom: r.p_nom, carte: r.p_carte, vu_le: r.p_vu_le }),
    })),
  });
}

function couper(env: Env, c: Connexion, par: string, quand: string, raison: string): D1PreparedStatement[] {
  const autre = c.a === par ? c.b : c.a;
  const notification = JSON.stringify({ evenement: 'coupee', raison, connexion: { id: c.id } });
  return [
    env.DB.prepare('UPDATE connexions SET coupee_le = ? WHERE id = ? AND coupee_le IS NULL').bind(quand, c.id),
    insererEnveloppe(env).bind(uuid(), c.id, par, autre, 'connexion', notification, quand),
  ];
}

async function lireMaConnexion(env: Env, id: string, noeud: Noeud): Promise<Connexion | null> {
  const c = await env.DB.prepare('SELECT * FROM connexions WHERE id = ?').bind(id).first<Connexion>();
  return c && (c.a === noeud.id || c.b === noeud.id) ? c : null;
}

async function couperConnexion({ env, noeud }: Contexte, [id]: string[]): Promise<Response> {
  const c = await lireMaConnexion(env, id, noeud);
  if (!c) throw new HttpError(404, 'connexion inconnue');
  if (c.coupee_le) throw new HttpError(409, 'connexion déjà coupée');
  await env.DB.batch(couper(env, c, noeud.id, maintenant(), 'coupee'));
  return json({ ok: true });
}

// ---------------------------------------------------------------- envelopes

async function envoyer({ request, env, noeud }: Contexte): Promise<Response> {
  const corps = await lireJson(request, TAILLE_MAX);
  const { connexion: connexionId, type, corps: contenu } = corps;
  if (typeof connexionId !== 'string') throw new HttpError(400, 'connexion requise');
  if (typeof type !== 'string' || !(TYPES as readonly string[]).includes(type)) {
    throw new HttpError(400, `type attendu : ${TYPES.join(', ')}`);
  }
  if (!estObjet(contenu)) throw new HttpError(400, 'corps attendu (objet JSON)');
  let id = uuid();
  if (corps.id !== undefined) {
    if (typeof corps.id !== 'string' || !ID_ENVELOPPE.test(corps.id)) throw new HttpError(400, 'id invalide');
    id = corps.id;
  }

  const c = await lireMaConnexion(env, connexionId, noeud);
  if (!c) throw new HttpError(403, 'connexion inconnue');
  if (c.coupee_le) throw new HttpError(403, 'connexion coupée');
  const destinataire = c.a === noeud.id ? c.b : c.a;

  const quand = maintenant();
  const resultat = await env.DB.prepare(
    'INSERT INTO enveloppes (id, connexion, de, a, type, corps, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
  )
    .bind(id, c.id, noeud.id, destinataire, type, JSON.stringify(contenu), quand)
    .run();
  if (resultat.meta.changes === 1) return json({ id, cree_le: quand }, 201);

  // Same id already posted: a retry of the same envelope is fine, anything else is a conflict.
  const existante = await env.DB.prepare('SELECT de, connexion, cree_le FROM enveloppes WHERE id = ?')
    .bind(id)
    .first<{ de: string; connexion: string; cree_le: string }>();
  if (existante && existante.de === noeud.id && existante.connexion === c.id) {
    return json({ id, cree_le: existante.cree_le });
  }
  throw new HttpError(409, 'id déjà utilisé');
}

async function boite({ env, url, noeud }: Contexte): Promise<Response> {
  const apres = url.searchParams.get('apres');
  const colonnes = 'id, connexion, de, a, type, corps, cree_le';
  const requete = apres
    ? env.DB.prepare(
        `SELECT ${colonnes} FROM enveloppes WHERE a = ?1 AND (cree_le > ?2 OR (cree_le = ?2 AND id > ?3))
         ORDER BY cree_le, id LIMIT ?4`,
      ).bind(noeud.id, ...decoderCurseur(apres), PAGE + 1)
    : env.DB.prepare(`SELECT ${colonnes} FROM enveloppes WHERE a = ?1 ORDER BY cree_le, id LIMIT ?2`).bind(
        noeud.id,
        PAGE + 1,
      );
  const { results } = await requete.all<{
    id: string;
    connexion: string;
    de: string;
    a: string;
    type: string;
    corps: string;
    cree_le: string;
  }>();
  const suite = results.length > PAGE;
  const page = results.slice(0, PAGE);
  const derniere = page.at(-1);
  return json({
    enveloppes: page.map((r) => ({ ...r, corps: JSON.parse(r.corps) })),
    curseur: derniere ? encoderCurseur(derniere.cree_le, derniere.id) : apres,
    suite,
  });
}

async function acquitter({ request, env, noeud }: Contexte): Promise<Response> {
  const { ids } = await lireJson(request, PETIT);
  if (!Array.isArray(ids) || ids.length > PAGE || !ids.every((id) => typeof id === 'string')) {
    throw new HttpError(400, `ids attendus (liste de ${PAGE} au plus)`);
  }
  if (ids.length === 0) return json({ acquittees: 0 });
  const resultat = await env.DB.prepare(
    'DELETE FROM enveloppes WHERE a = ? AND id IN (SELECT value FROM json_each(?))',
  )
    .bind(noeud.id, JSON.stringify(ids))
    .run();
  return json({ acquittees: resultat.meta.changes });
}

// ---------------------------------------------------------------- router

function decoderSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpError(400, 'chemin invalide');
  }
}

type Route = [string, RegExp, (c: Contexte, params: string[]) => Promise<Response>];

const ROUTES: Route[] = [
  ['GET', /^\/noeuds\/moi$/, moi],
  ['DELETE', /^\/noeuds\/moi$/, desinscrire],
  ['PUT', /^\/noeuds\/moi\/carte$/, publierCarte],
  ['POST', /^\/invitations$/, creerInvitation],
  ['POST', /^\/invitations\/([^/]+)\/accepter$/, accepterInvitation],
  ['GET', /^\/connexions$/, listerConnexions],
  ['DELETE', /^\/connexions\/([^/]+)$/, couperConnexion],
  ['POST', /^\/envois$/, envoyer],
  ['GET', /^\/boite$/, boite],
  ['POST', /^\/boite\/acquitter$/, acquitter],
];

export async function router(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/sante' && request.method === 'GET') return json({ ok: true });
  if (pathname === '/noeuds' && request.method === 'POST') return inscrire(request, env);

  let cheminConnu = false;
  for (const [methode, motif, traiter] of ROUTES) {
    const m = motif.exec(pathname);
    if (!m) continue;
    cheminConnu = true;
    if (methode !== request.method) continue;
    const noeud = await authentifier(request, env);
    ctx.waitUntil(
      env.DB.prepare('UPDATE noeuds SET vu_le = ? WHERE id = ?').bind(maintenant(), noeud.id).run(),
    );
    return traiter({ request, env, ctx, url, noeud }, m.slice(1).map(decoderSegment));
  }
  if (cheminConnu || pathname === '/sante' || pathname === '/noeuds') throw new HttpError(405, 'méthode non permise');
  throw new HttpError(404, 'introuvable');
}
