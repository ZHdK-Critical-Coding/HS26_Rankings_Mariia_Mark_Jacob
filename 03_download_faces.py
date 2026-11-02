"""Download a pool of unique AI-generated faces into images/pool/.
Safe to re-run: only fetches until the pool holds FACE_POOL_SIZE unique images."""
import hashlib, pathlib, time
from io import BytesIO
import requests
from PIL import Image
from config import FACE_POOL_SIZE

# The root URL now serves an HTML page; the face itself is at /random-person.jpeg
URL = "https://thispersondoesnotexist.com/random-person.jpeg"
POOL = pathlib.Path("images/pool")
POOL.mkdir(parents=True, exist_ok=True)
MAX_REQUESTS = FACE_POOL_SIZE * 3

hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in POOL.glob("face_*.jpg")}
print(f"pool has {len(hashes)} faces")

requests_made = 0
while len(hashes) < FACE_POOL_SIZE and requests_made < MAX_REQUESTS:
    requests_made += 1
    try:
        r = requests.get(URL, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        if not r.headers.get("content-type", "").startswith("image/"):
            raise ValueError(f"not an image: {r.headers.get('content-type')}")
        Image.open(BytesIO(r.content)).verify()          # must be a real image
        h = hashlib.sha256(r.content).hexdigest()
        if h in hashes:
            print("duplicate, skipped")
        else:
            n = len(hashes) + 1
            while (POOL / f"face_{n:03d}.jpg").exists():
                n += 1
            (POOL / f"face_{n:03d}.jpg").write_bytes(r.content)
            hashes.add(h)
            print(f"saved face_{n:03d}.jpg ({len(hashes)}/{FACE_POOL_SIZE})")
    except Exception as e:
        print("failed:", e)
    time.sleep(2)

print(f"done: {len(hashes)} unique faces in {POOL}")
if len(hashes) < FACE_POOL_SIZE:
    raise SystemExit("pool incomplete, re-run the script")
