import os, requests
from common import connect, add_entity, download_image

N = 30
db = connect()
movies = []
for page in (1, 2):
    r = requests.get("https://api.themoviedb.org/3/movie/top_rated",
                     params={"api_key": os.environ["TMDB_KEY"], "page": page}).json()
    if "results" not in r:
        print("TMDB error:", r); break
    movies += [m for m in r["results"] if m.get("poster_path")]

for m in movies[:N]:
    try:
        img = download_image(f"https://image.tmdb.org/t/p/w500{m['poster_path']}",
                             f"images/movies/{m['id']}.jpg")
        add_entity(db, "movies", m["title"], img, "tmdb", str(m["id"]))
        print("ok", m["title"])
    except Exception as e:
        print("failed", m["title"], e)
db.commit()
