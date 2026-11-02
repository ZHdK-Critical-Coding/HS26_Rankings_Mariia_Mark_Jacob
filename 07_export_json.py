"""Export categories, metrics and entities to web/data.json and copy images to web/images/.
hidden_question is deliberately NOT exported. Safe to re-run (web/images is rebuilt)."""
import json, pathlib, shutil, sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else "data/art.db"
WEB = pathlib.Path("web")
IMG = WEB / "images"

db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

categories = [{"id": r["id"], "name": r["name"], "headline": r["headline_template"]}
              for r in db.execute("SELECT id, name, headline_template FROM categories ORDER BY id")]
metrics = [{"id": r["id"], "name": r["name"], "kind": r["kind"]}
           for r in db.execute("SELECT id, name, kind FROM metrics ORDER BY id")]

values = {}
for r in db.execute("""SELECT v.entity_id, m.name, v.value FROM entity_values v
                       JOIN metrics m ON m.id=v.metric_id"""):
    values.setdefault(r["entity_id"], {})[r["name"]] = int(r["value"])

if IMG.exists():
    shutil.rmtree(IMG)
entities = []
for r in db.execute("""SELECT e.id, c.name AS category, e.title, e.image_path, e.sort_key
                       FROM entities e JOIN categories c ON c.id=e.category_id ORDER BY e.id"""):
    src = pathlib.Path(r["image_path"])                 # e.g. images/movies/123.jpg
    dst = WEB / src                                     # web/images/movies/123.jpg
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    entities.append({"id": r["id"], "category": r["category"], "title": r["title"],
                     "image": src.as_posix(), "sortKey": r["sort_key"],
                     "values": values.get(r["id"], {})})

out = {"categories": categories, "metrics": metrics, "entities": entities}
(WEB / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"web/data.json: {len(categories)} categories, {len(metrics)} metrics, "
      f"{len(entities)} entities; {len(entities)} images copied to {IMG}")
