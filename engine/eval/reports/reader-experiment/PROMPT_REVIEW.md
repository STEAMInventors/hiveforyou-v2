# T3.9 Reader architecture experiment — prompt review

No document text or student information in this file.

- Prompt version: `hive-reader-prompt/2.0.0`
- Shared prefix (§1–4 + full golden v4.1 + §7–11 parallel §10) SHA-256: `f4f425e1a985c81661ab81a299a5bc0b6b97f679f1cae9ecc7cf4ba046304ca3`
- Variant A baseline (`case_wide` without §6) stable prefix: **13288** chars (~**3322** tokens)
- Variant A2 (`case_wide` with §6) stable prefix: **18104** chars (~**4526** tokens); Δ **4816** chars
- Variant A2 (`case_wide`) SHA-256: `81233aa51b6ec10a9c7e44288965f5e2770a4a6c98927b139a9ed2c51bb669ee`
- Variant B (`parallel_document` baseline) SHA-256: `6e97b881c1f310be1c80844813851849199e24827cbe7698542da58ea5033fce`
- Variant B-P6 (`parallel_document` + `HIVE_READER_PARALLEL_PROMPT_VARIANT=p6`) SHA-256: `3b671c93576d081e0b1033c514d2c2ab356150e72f8c25d24fc8d0f08057e36e`

Architectures differ in §5 workflow; case_wide adds §6 case-wide checklist and §10 supplement.
Baseline `parallel_document` has no §6; B-P6 adds document-scoped §6 and §10 supplement via env.

Golden methodology map: `engine/eval/reports/reader-experiment/GOLDEN_REFERENCE_MAP.md`
