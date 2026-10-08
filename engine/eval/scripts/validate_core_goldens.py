import json
from pathlib import Path

REPO = Path(r"c:\Users\abhattacharyya\hiveforyou-v2")
CORE = [
    ("l001", "tune", "engine/eval/golden/tune/l001.json", 117),
    ("l002", "tune", "engine/eval/golden/tune/l002.json", 173),
    ("l003", "tune", "engine/eval/golden/tune/l003.json", 86),
    ("l004", "holdout", "engine/eval/golden/holdout/l004.json", 80),
    ("l005", "tune", "engine/eval/golden/tune/l005.json", 123),
    ("l006", "holdout", "engine/eval/golden/holdout/l006.json", 203),
]

def load_pages(corpus_dir, document_id):
    snap_path = REPO / corpus_dir / "document-pages" / document_id.replace(".pdf", ".json")
    snap = json.load(open(snap_path, encoding="utf-8"))
    return {p["pageNumber"]: p for p in snap["documentPages"]["pages"]}

failed = False
total = 0
for case_id, split, rel, exp_facts in CORE:
    g = json.load(open(REPO / rel, encoding="utf-8"))
    ok = True
    if g.get("split") != split: print(f"{case_id} bad split"); ok = False
    if g.get("verifiedBy") != "Aryya Bhattacharyya": print(f"{case_id} bad verifiedBy"); ok = False
    if g.get("draft") is not False: print(f"{case_id} bad draft"); ok = False
    if len(g.get("facts", [])) != exp_facts: print(f"{case_id} facts {len(g['facts'])} != {exp_facts}"); ok = False
    ids = [f["id"] for f in g["facts"]]
    if len(ids) != len(set(ids)): print(f"{case_id} duplicate fact ids"); ok = False
    pages_cache = {}
    anchors_ok = 0
    for f in g["facts"]:
        key = (g["corpusDir"], f["documentId"])
        if key not in pages_cache:
            pages_cache[key] = load_pages(g["corpusDir"], f["documentId"])
        page = pages_cache[key].get(f["pageNumber"])
        if not page:
            print(f"{case_id} {f['id']} missing page"); ok = False; continue
        s, e = f["wordRange"]
        if s < 0 or e <= s or e > len(page["words"]):
            print(f"{case_id} {f['id']} bad range [{s},{e}) words={len(page['words'])}"); ok = False; continue
        anchors_ok += 1
    total += len(g["facts"])
    print(f"{case_id} split={g['split']} facts={len(g['facts'])} gaps={len(g['gaps'])} tripwires={len(g['tripwires'])} anchors={anchors_ok}/{len(g['facts'])} {'OK' if ok else 'FAIL'}")
    failed = failed or not ok

print("total GoldenFacts", total)
if failed or total != 782:
    raise SystemExit(1)