CREATE TABLE sets (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  set_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  text TEXT NOT NULL,
  url TEXT,
  PRIMARY KEY (set_key, position),
  FOREIGN KEY (set_key) REFERENCES sets(key) ON DELETE CASCADE
);
