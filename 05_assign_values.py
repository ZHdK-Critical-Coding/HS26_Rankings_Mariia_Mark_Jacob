"""Assign random integer values 0-100 for every numeric metric (seed 42).
The alphabetical metric stores nothing; it uses entities.sort_key.
Deterministic: entities are visited in (category, source_id) order, so re-runs give identical values."""
import random
from common import connect
from config import VALUE_SEED

db = connect()
rng = random.Random(VALUE_SEED)
metrics = db.execute("SELECT id, name FROM metrics WHERE kind='numeric' ORDER BY name").fetchall()
entities = db.execute("""SELECT e.id FROM entities e JOIN categories c ON c.id=e.category_id
                         ORDER BY c.name, e.source_id""").fetchall()

db.execute("DELETE FROM entity_values")          # full rebuild, no leftovers
for (eid,) in entities:
    for mid, _ in metrics:
        db.execute("INSERT INTO entity_values(entity_id, metric_id, value) VALUES (?,?,?)",
                   (eid, mid, rng.randint(0, 100)))
db.commit()
print(f"{len(entities)} entities x {len(metrics)} metrics = "
      f"{db.execute('SELECT COUNT(*) FROM entity_values').fetchone()[0]} values")
