import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /sante', () => {
  it('answers ok', async () => {
    const res = await exports.default.fetch('https://relais.test/sante');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
