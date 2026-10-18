import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"engine/domain-packs/iep/v0.2.1"
def get(name):return json.loads((ROOT/(name+".json")).read_text())
def main():
 manifest=get("manifest")
 assert manifest["status"]=="review_only_not_registered"
 assert manifest["packVersion"]=="0.2.1-draft"
 for s in manifest["schemaSections"]:assert (ROOT/(s+".json")).exists(),s
 facts=get("fact-types")["factTypes"]; fs={x["id"] for x in facts};assert len(fs)==len(facts)
 docs=get("document-types")["documentTypes"];ds={x["id"] for x in docs};assert len(ds)==len(docs)==23
 for d in docs:
  ids=[x["factTypeId"] for x in d["checklist"]]
  assert len(ids)==len(set(ids)) and set(ids)<=fs,d["id"]
 by={d["id"]:{x["factTypeId"] for x in d["checklist"]} for d in docs}
 assert {'referral.observation','referral.planned_parent_input','referral.next_step'}<=by['referral']
 assert {'evaluation_plan.information_available','evaluation_plan.information_to_gather','evaluation_plan.consent_required'}<=by['evaluation_plan']
 for doc in ['parent_consent','eligibility','iep_initial','iep_annual','iep_amendment','iep_correction']:
  assert 'document.lineage_reference' in by[doc]
 rel=get('relationships')['relationships'];rs={r['id'] for r in rel};assert len(rs)==len(rel)
 for r in rel:assert set(r['from']+r['to'])<=fs,r['id']
 assert {'conflicts_with','changed_from','refers_to_document','implements_eligibility','has_service'}<=rs
 checks=get('insight-checks')['insightChecks']; assert len({c['id'] for c in checks})==len(checks)
 for c in checks:
  assert set(c['inputs'])<=fs,c['id']
  assert c['unknownOutcome']=='no_public_finding'
  assert not ('{' in c['questionTemplate'] or '}' in c['questionTemplate'])
  assert c['preconditionPolicy']['allOperandsTypedAndBound']
 assert get('requirements')['requirements']==[]
 print(f'PASS: {len(docs)} documents, {len(facts)} fact types, {len(rel)} relationships, {len(checks)} insight checks; cross references sound.')
 print('STATIC ONLY: no reader, golden semantic run, runtime adapter, or cross-domain conformance tested.')
if __name__=='__main__':main()
