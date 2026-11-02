"""Match faces from images/pool/ to the names in students.txt (reproducible, seed 7).
Writes 300x300 crops to images/students/<slug>.jpg and upserts the students category.
Safe to re-run: same seed + same pool -> same result."""
import pathlib, random, re, unicodedata
from PIL import Image
from common import connect, add_entity
from config import STUDENT_SEED

POOL = pathlib.Path("images/pool")
OUT = pathlib.Path("images/students")
OUT.mkdir(parents=True, exist_ok=True)

def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def crop_square(src, dst, size=300):
    img = Image.open(src).convert("RGB")
    w, h = img.size; s = min(w, h)
    img = img.crop(((w-s)//2, (h-s)//2, (w+s)//2, (h+s)//2)).resize((size, size), Image.LANCZOS)
    img.save(dst, quality=85)

names = [l.strip() for l in open("students.txt", encoding="utf-8") if l.strip()]
pool = sorted(POOL.glob("face_*.jpg"))              # sorted -> deterministic input order
if len(pool) < len(names):
    raise SystemExit(f"need {len(names)} faces, pool has {len(pool)}; run 03_download_faces.py")

slugs = [slugify(n) for n in names]
assert len(set(slugs)) == len(slugs), "slug collision in students.txt"

faces = random.Random(STUDENT_SEED).sample(pool, len(names))

db = connect()
for name, slug, face in zip(names, slugs, faces):
    dst = OUT / f"{slug}.jpg"
    crop_square(face, dst)
    add_entity(db, "students", name, str(dst), "thispersondoesnotexist", slug)
    print(f"{name:32s} <- {face.name}")

# drop students that are no longer in students.txt (and their values)
cat_id = db.execute("SELECT id FROM categories WHERE name='students'").fetchone()[0]
ph = ",".join("?" * len(slugs))
stale = [r[0] for r in db.execute(
    f"SELECT id FROM entities WHERE category_id=? AND source_id NOT IN ({ph})", [cat_id, *slugs])]
for eid in stale:
    db.execute("DELETE FROM entity_values WHERE entity_id=?", (eid,))
    db.execute("DELETE FROM entities WHERE id=?", (eid,))
db.commit()
print(f"{len(names)} students stored, {len(stale)} stale removed")
