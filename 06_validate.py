"""Validate the database. Exit code 1 on any error.
  python3 06_validate.py           -> check only
  python3 06_validate.py --freeze  -> check, and if everything passes copy data/art.db to data/art_clean.db"""
import hashlib, os, shutil, sqlite3, sys
from config import CATEGORIES, METRICS

DB, CLEAN = "data/art.db", "data/art_clean.db"
db = sqlite3.connect(DB)
errors = []
def check(ok, msg):
    print(("  ok   " if ok else "  FAIL ") + msg)
    if not ok: errors.append(msg)

print("categories")
names = [r[0] for r in db.execute("SELECT name FROM categories ORDER BY name")]
check(names == sorted(c[0] for c in CATEGORIES), f"categories are exactly {sorted(c[0] for c in CATEGORIES)} (got {names})")
for name, _script, expected, _q, _h in CATEGORIES:
    n = db.execute("""SELECT COUNT(*) FROM entities e JOIN categories c ON c.id=e.category_id
                      WHERE c.name=?""", (name,)).fetchone()[0]
    check(n == expected, f"{name}: {n} entities (expected {expected})")

print("metrics / values")
numeric = [m for m, k in METRICS if k == "numeric"]
bad = db.execute(f"""SELECT e.title, COUNT(v.metric_id) FROM entities e
    LEFT JOIN entity_values v ON v.entity_id=e.id
    LEFT JOIN metrics m ON m.id=v.metric_id AND m.kind='numeric'
    GROUP BY e.id HAVING COUNT(m.id) != ?""", (len(numeric),)).fetchall()
check(not bad, f"every entity has {len(numeric)} numeric values" + (f" -> {bad[:5]}" if bad else ""))
orphans = db.execute("SELECT COUNT(*) FROM entity_values WHERE entity_id NOT IN (SELECT id FROM entities)").fetchone()[0]
check(orphans == 0, f"no orphan values ({orphans})")
rng = db.execute("SELECT MIN(value), MAX(value) FROM entity_values").fetchone()
check(rng[0] is not None and 0 <= rng[0] and rng[1] <= 100, f"values within 0..100 {rng}")
alpha = db.execute("""SELECT COUNT(*) FROM entity_values v JOIN metrics m ON m.id=v.metric_id
                      WHERE m.kind='alphabetical'""").fetchone()[0]
check(alpha == 0, "alphabetical metric has no stored values")
nokey = db.execute("SELECT COUNT(*) FROM entities WHERE sort_key IS NULL OR sort_key=''").fetchone()[0]
check(nokey == 0, f"every entity has a sort_key ({nokey} missing)")

print("images")
rows = db.execute("SELECT title, image_path FROM entities").fetchall()
missing = [p for _, p in rows if not os.path.isfile(p)]
check(not missing, f"all {len(rows)} image files exist" + (f" -> missing {missing[:5]}" if missing else ""))
paths = [p for _, p in rows]
check(len(paths) == len(set(paths)), "no duplicate image paths")
hashes = {}
for t, p in rows:
    if os.path.isfile(p):
        hashes.setdefault(hashlib.sha256(open(p, "rb").read()).hexdigest(), []).append(t)
dup_img = [ts for ts in hashes.values() if len(ts) > 1]
check(not dup_img, "no duplicate image contents" + (f" -> {dup_img}" if dup_img else ""))

print("titles")
dup_t = db.execute("""SELECT c.name, e.title, COUNT(*) FROM entities e JOIN categories c ON c.id=e.category_id
                      GROUP BY c.name, e.title HAVING COUNT(*) > 1""").fetchall()
check(not dup_t, "no duplicate titles within a category" + (f" -> {dup_t}" if dup_t else ""))

db.close()
if errors:
    print(f"\n{len(errors)} problem(s) found")
    sys.exit(1)
print("\nall checks passed")
if "--freeze" in sys.argv:
    shutil.copyfile(DB, CLEAN)
    print(f"frozen copy written to {CLEAN}")
