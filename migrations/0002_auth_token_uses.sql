-- The optional club account (e1-t12, worker/auth.ts): the id of every sign-in token from the bridge
-- table this site has taken, until it expires, so that each token works once. The primary key makes
-- taking one atomic; expired rows are deleted on the next sign-in. Nothing else about the person.
CREATE TABLE IF NOT EXISTS auth_token_uses (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_token_uses_expires_at ON auth_token_uses (expires_at);
