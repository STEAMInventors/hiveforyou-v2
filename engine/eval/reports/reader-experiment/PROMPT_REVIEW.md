# T3.9 Reader architecture experiment — prompt review

No document text or student information in this file.

- Prompt version: `hive-reader-prompt/2.0.0`
- Shared prefix (§1–4 + full golden v4.1 + §7–11 parallel §10) SHA-256: `f4f425e1a985c81661ab81a299a5bc0b6b97f679f1cae9ecc7cf4ba046304ca3`
- Variant A baseline (`case_wide` without §6) stable prefix: **13288** chars (~**3322** tokens)
- Variant A2 (`case_wide` with §6) stable prefix: **18104** chars (~**4526** tokens); Δ **4816** chars vs Variant A baseline
- Prior A2 review draft (5ddaaeb, duplicated reader + full vocabulary in §6): **~24909** chars (~**6227** tokens); §6 alone **11619** chars → corrected §6 **4814** chars (**−6805**)
- Variant A2 (`case_wide`) SHA-256: `81233aa51b6ec10a9c7e44288965f5e2770a4a6c98927b139a9ed2c51bb669ee`
- Variant B (`parallel_document`) SHA-256: `6e97b881c1f310be1c80844813851849199e24827cbe7698542da58ea5033fce`

Architectures differ in §5 workflow; case_wide adds §6 domain-aware coverage checklist and §10 supplement.
`parallel_document` stable prefix is unchanged when only §6 (case_wide) edits.

Golden methodology map: `engine/eval/reports/reader-experiment/GOLDEN_REFERENCE_MAP.md`
