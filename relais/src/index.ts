import { HttpError, erreur } from './lib';
import { purger } from './purge';
import { router } from './relais';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await router(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return erreur(e.status, e.message);
      console.error(e);
      return erreur(500, 'erreur interne');
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(purger(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
