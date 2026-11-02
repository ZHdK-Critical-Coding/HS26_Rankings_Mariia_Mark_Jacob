# Central configuration. Adding a dataset = one fetch script + one line in CATEGORIES.
#
# (name, fetch_script, expected_count, hidden_question, headline_template)
#   hidden_question  : the concept behind the ranking. Stays in the DB, is NEVER exported.
#   headline_template: main clickbait headline for the blog feed.
CATEGORIES = [
    ("movies",   "02_fetch_movies.py",   30, "Who would you trust with your keys?",
     "We Ranked Every Movie and Number 1 Is Not the One You'd Expect"),
    ("students", "04_match_students.py", 40, "Who gets the window seat?",
     "We Ranked Every Student and Nobody Is Speaking Now"),
]

# (name, kind). Numeric metrics get stored values; alphabetical uses entities.sort_key.
METRICS = [
    ("metric_a", "numeric"),
    ("metric_b", "numeric"),
    ("metric_c", "numeric"),
    ("alphabetical", "alphabetical"),
]

VALUE_SEED = 42      # seed for numeric metric values
STUDENT_SEED = 7     # seed for face <-> name matching
FACE_POOL_SIZE = 50
