export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/sante') {
      return Response.json({ ok: true });
    }
    return Response.json({ erreur: 'introuvable' }, { status: 404 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
