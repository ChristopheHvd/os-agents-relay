-- Directory (nodes, invitations, connections) plus envelopes not yet picked up.
-- Timestamps are ISO 8601 UTC strings, so they sort lexicographically.

CREATE TABLE noeuds (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  carte TEXT,
  secret_hash TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  vu_le TEXT
);

CREATE TABLE invitations (
  code TEXT PRIMARY KEY,
  de TEXT NOT NULL,
  email TEXT,
  cree_le TEXT NOT NULL,
  expire_le TEXT NOT NULL,
  acceptee_le TEXT,
  connexion TEXT
);
CREATE INDEX invitations_de ON invitations (de);

CREATE TABLE connexions (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  coupee_le TEXT
);
CREATE INDEX connexions_a ON connexions (a);
CREATE INDEX connexions_b ON connexions (b);

CREATE TABLE enveloppes (
  id TEXT PRIMARY KEY,
  connexion TEXT NOT NULL,
  de TEXT NOT NULL,
  a TEXT NOT NULL,
  type TEXT NOT NULL,
  corps TEXT NOT NULL,
  cree_le TEXT NOT NULL
);
CREATE INDEX enveloppes_a_cree_le ON enveloppes (a, cree_le, id);
CREATE INDEX enveloppes_cree_le ON enveloppes (cree_le);
