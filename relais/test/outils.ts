import { exports } from 'cloudflare:workers';

export const BASE = 'https://relais.test';

export interface Noeud {
  id: string;
  secret: string;
  auth: string;
}

export async function appel(
  methode: string,
  chemin: string,
  options: { auth?: string; corps?: unknown; brut?: string } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (options.auth) headers.authorization = `Bearer ${options.auth}`;
  let body: string | undefined;
  if (options.brut !== undefined) body = options.brut;
  else if (options.corps !== undefined) body = JSON.stringify(options.corps);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await exports.default.fetch(`${BASE}${chemin}`, { method: methode, headers, body });
  const texte = await res.text();
  return { status: res.status, json: texte ? JSON.parse(texte) : null };
}

export async function inscrire(nom = 'Nœud de test'): Promise<Noeud> {
  const { status, json } = await appel('POST', '/noeuds', { corps: { nom, cle_inscription: 'cle-de-test' } });
  if (status !== 201) throw new Error(`inscription : ${status} ${JSON.stringify(json)}`);
  return { id: json.id, secret: json.secret, auth: `${json.id}.${json.secret}` };
}

/** Two registered nodes, connected through an invitation from `a` accepted by `b`. */
export async function paire(): Promise<{ a: Noeud; b: Noeud; connexion: string }> {
  const a = await inscrire('OS A (test)');
  const b = await inscrire('OS B (test)');
  const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
  const acc = await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: b.auth });
  if (acc.status !== 201) throw new Error(`acceptation : ${acc.status} ${JSON.stringify(acc.json)}`);
  // Clear the "accepted" notice so each test starts with empty mailboxes.
  const boite = await appel('GET', '/boite', { auth: a.auth });
  await appel('POST', '/boite/acquitter', { auth: a.auth, corps: { ids: boite.json.enveloppes.map((e: any) => e.id) } });
  return { a, b, connexion: acc.json.connexion.id };
}

export const mission = (consigne = 'Écrire un livre blanc fictif') => ({
  kind: 'task',
  id: crypto.randomUUID(),
  contextId: crypto.randomUUID(),
  status: { state: 'submitted', timestamp: new Date().toISOString() },
  history: [{ kind: 'message', role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: consigne }] }],
});
