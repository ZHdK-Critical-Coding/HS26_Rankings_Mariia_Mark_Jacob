"""Create the schema and sync categories/metrics with config.py. Safe to re-run."""
from common import connect
from config import CATEGORIES, METRICS

db = connect()
db.execute("PRAGMA foreign_keys = ON")
db.executescript("""
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE, hidden_question TEXT, headline_template TEXT);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL, image_path TEXT NOT NULL, source TEXT, source_id TEXT, sort_key TEXT,
  UNIQUE(category_id, source, source_id));
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE,
  kind TEXT CHECK (kind IN ('numeric','alphabetical')));
CREATE TABLE IF NOT EXISTS entity_values (
  entity_id INTEGER REFERENCES entities(id), metric_id INTEGER REFERENCES metrics(id),
  value REAL CHECK (value BETWEEN 0 AND 100), PRIMARY KEY (entity_id, metric_id));
""")

# upsert configured categories (keeps ids stable)
for name, _script, _n, question, headline in CATEGORIES:
    db.execute("""INSERT INTO categories(name, hidden_question, headline_template) VALUES (?,?,?)
                  ON CONFLICT(name) DO UPDATE SET hidden_question=excluded.hidden_question,
                                                  headline_template=excluded.headline_template""",
               (name, question, headline))

# remove categories that are no longer configured (e.g. dishes), with their entities/values
names = [c[0] for c in CATEGORIES]
ph = ",".join("?" * len(names))
stale = db.execute(f"SELECT id, name FROM categories WHERE name NOT IN ({ph})", names).fetchall()
for cat_id, name in stale:
    db.execute("""DELETE FROM entity_values WHERE entity_id IN
                  (SELECT id FROM entities WHERE category_id=?)""", (cat_id,))
    db.execute("DELETE FROM entities WHERE category_id=?", (cat_id,))
    db.execute("DELETE FROM categories WHERE id=?", (cat_id,))
    print("removed category", name)

for name, kind in METRICS:
    db.execute("""INSERT INTO metrics(name, kind) VALUES (?,?)
                  ON CONFLICT(name) DO UPDATE SET kind=excluded.kind""", (name, kind))
db.commit()
print("categories:", db.execute("SELECT name FROM categories ORDER BY id").fetchall())
