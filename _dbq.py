import sqlite3, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
db = sqlite3.connect('file:C:/Users/Drew/AppData/Roaming/ilystream/ilystream.db?mode=ro', uri=True)
cur = db.cursor()
ids = {'6519208051391184906','7592536990005117966'}
names = {'queena.chaos','beautiful.monsta7'}
print("=== join events today (2026-07-17) ===")
n = cur.execute("SELECT COUNT(*) FROM event_history WHERE event_type='join' AND created_at >= '2026-07-17'").fetchone()[0]
print("count:", n)
print("=== ALL events today for queena identities ===")
rows = cur.execute("SELECT event_type, user_name, created_at, data_json FROM event_history WHERE created_at >= '2026-07-17' ORDER BY id DESC").fetchall()
found = {}
for et, un, ca, raw in rows:
    try: obj = json.loads(raw)
    except: obj = {}
    u = obj.get('user') or {}
    uid = str(u.get('id') or '')
    uname = str(u.get('username') or '').lower()
    if uid in ids or uname in names:
        found.setdefault(et, [])
        if len(found[et]) < 3:
            found[et].append((ca, uid, uname, u.get('displayName')))
if not found:
    print("  (no events today for queena's linked identities)")
for et, samples in found.items():
    print(f"  {et}: {len(samples)}+ samples")
    for s in samples: print("      ", s)
print("=== her join events EVER (any date) ===")
for et in ['join']:
    for (ca, raw) in cur.execute("SELECT created_at, data_json FROM event_history WHERE event_type=? ORDER BY id DESC LIMIT 3000",(et,)).fetchall():
        try: obj=json.loads(raw)
        except: continue
        u=obj.get('user') or {}
        if str(u.get('id') or '') in ids or str(u.get('username') or '').lower() in names:
            print(f"   join {ca}: id={u.get('id')} username={u.get('username')}")
db.close()
