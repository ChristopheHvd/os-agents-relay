export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const erreur = (status: number, message: string): Response =>
  Response.json({ erreur: message }, { status });

export const maintenant = (): string => new Date().toISOString();

export const dansJours = (jours: number, depuis = Date.now()): string =>
  new Date(depuis + jours * 86_400_000).toISOString();

export const uuid = (): string => crypto.randomUUID();

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 15 random bytes = 120 bits = exactly 24 base32 characters. */
export function codeInvitation(): string {
  const octets = crypto.getRandomValues(new Uint8Array(15));
  let bits = 0;
  let valeur = 0;
  let code = '';
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      code += BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return code;
}

export function secretAleatoire(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256(texte: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte)));
}

export const hex = (octets: Uint8Array): string =>
  [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');

/** Compares two strings in constant time by hashing both to the same length first. */
export async function egaux(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export const TAILLE_MAX = 256 * 1024;

export async function lireJson(request: Request, max = TAILLE_MAX): Promise<Record<string, unknown>> {
  const annoncee = Number(request.headers.get('content-length') ?? 0);
  if (annoncee > max) throw new HttpError(413, 'trop volumineux');
  const octets = new Uint8Array(await request.arrayBuffer());
  if (octets.byteLength > max) throw new HttpError(413, 'trop volumineux');
  if (octets.byteLength === 0) return {};
  let corps: unknown;
  try {
    corps = JSON.parse(new TextDecoder().decode(octets));
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
  if (!estObjet(corps)) throw new HttpError(400, 'un objet JSON est attendu');
  return corps;
}

export const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function lireCarte(texte: string | null): Record<string, unknown> | null {
  if (!texte) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

export const encoderCurseur = (creeLe: string, id: string): string =>
  btoa(`${creeLe}|${id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function decoderCurseur(curseur: string): [string, string] {
  try {
    const texte = atob(curseur.replace(/-/g, '+').replace(/_/g, '/'));
    const i = texte.indexOf('|');
    if (i < 1) throw new Error();
    return [texte.slice(0, i), texte.slice(i + 1)];
  } catch {
    throw new HttpError(400, 'curseur invalide');
  }
}
