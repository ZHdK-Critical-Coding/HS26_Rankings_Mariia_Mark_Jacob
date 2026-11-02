import sqlite3, requests, pathlib, time, re, unicodedata
from PIL import Image
from io import BytesIO

DB = "data/art.db"

def connect():
    return sqlite3.connect(DB)

def make_sort_key(title):
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"^(the|a|an|der|die|das|ein|eine)\s+", "", t.casefold().strip())

def download_image(url, path, size=(300, 300)):
    """Downloads, center-crops to a uniform size, saves as JPG."""
    path = pathlib.Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):
        r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        if r.ok and len(r.content) > 5000:
            img = Image.open(BytesIO(r.content)).convert("RGB")
            w, h = img.size; s = min(w, h)
            img = img.crop(((w-s)//2, (h-s)//2, (w+s)//2, (h+s)//2)).resize(size)
            img.save(path, quality=85)
            return str(path)
        time.sleep(2)
    raise RuntimeError(f"download failed: {url}")

def add_entity(db, category, title, image_path, source, source_id):
    cat_id = db.execute("SELECT id FROM categories WHERE name=?", (category,)).fetchone()[0]
    # upsert: re-running a fetch script updates rows instead of failing / duplicating
    db.execute("""INSERT INTO entities(category_id,title,image_path,source,source_id,sort_key)
                  VALUES (?,?,?,?,?,?)
                  ON CONFLICT(category_id,source,source_id) DO UPDATE SET
                    title=excluded.title, image_path=excluded.image_path,
                    sort_key=excluded.sort_key""",
               (cat_id, title, image_path, source, source_id, make_sort_key(title)))
