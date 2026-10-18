import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"engine/domain-packs/iep/v0.2"
def get(name): return json.loads((ROOT/name).read_text())
def main():
    manifest=get("manifest.json")
    assert manifest["status"]=="review_only_not_registered"
    for s in manifest["schemaSections"]: assert (ROOT/(s+".json")).exists(),s
    facts=get("fact-types.json")["factTypes"]; fids=[f["id"] for f in facts]
    assert len(fids)==len(set(fids)) and len(fids)>100
    assert all(f["identity"]["onAmbiguity"]=="keep_separate" for f in facts)
    doc=get("document-types.json")["documentTypes"]; dids=[d["id"] for d in doc]
    assert len(dids)==len(set(dids)) and len(dids)>=20
    for d in doc:
        assert all(x["factTypeId"] in fids for x in d["checklist"]),d["id"]
    for r in get("relationships.json")["relationships"]:
        assert all(x in fids for x in r["from"]+r["to"]),r["id"]
    for r in get("insight-checks.json")["insightChecks"]:
        assert all(x in fids for x in r["inputs"]),r["id"]
        assert r["unknownOutcome"]=="no_public_finding"
        assert "{" not in r["questionTemplate"]
    assert get("requirements.json")["requirements"]==[]
    print(f"PASS: {len(doc)} document types, {len(facts)} typed facts, {len(get('relationships.json')['relationships'])} relationships, {len(get('insight-checks.json')['insightChecks'])} insight checks; no dangling fact references.")
    print("NOTE: Static structure only; does not prove runtime/semantic correctness or portability.")
if __name__=='__main__': main()
