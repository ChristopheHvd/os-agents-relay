declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
  interface Env {
    DB: D1Database;
    CLE_INSCRIPTION?: string;
  }
}
