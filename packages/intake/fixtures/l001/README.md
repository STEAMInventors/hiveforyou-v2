# L001 synthetic corpus (committed)

Eight synthetic PDFs with **no real personal data**. Every page is marked **“SYNTHETIC DEVELOPMENT RECORD — NOT A REAL STUDENT”**. Do not edit these files in place; new qualification cases get new fixture folders.

Same bytes for intake tests and `study:l001` (default `L001_CORPUS_DIR` → this directory).

| File | SHA-256 |
|------|---------|
| 01_initial_referral.pdf | 8ae4ac0ce3009151dea07f9751e65fab11d9147a67f2eec2f5f1ecd09be4629d |
| 02_evaluation_plan.pdf | ffd4ebe21c06d6e365d9d581b996e17a79a7f81207722e83b1c1005dc70935c6 |
| 03_parent_evaluation_consent.pdf | 864013b7e57a576ce6587589c67baa03003cf56c7cf0fb4fc01c2f6b43aded9c |
| 04_psychoeducational_evaluation.pdf | 7496e950f951b666a7d532ad8c8d782946b60688650084c84b5ebebf9b17ef7d |
| 05_academic_evaluation.pdf | 5fde3e11eaeb224daa7df5a61e72dd9d351dc6c02ee634e5ee51ee478449ec3f |
| 06_speech_language_evaluation.pdf | 8adc5107634a1be4ab7d9b4f0817b0f254331ce1598de4ac5a859d1257e810fd |
| 07_eligibility_determination.pdf | 35b0594bbbbc68239a3dad3a657290b1ea08093e2290a0d093ef716ca1c72ba2 |
| 08_initial_iep.pdf | 1e6b380e4a348029a97d1648228530b8cb060609c1ec30404cc43545d9833e2c |

## `locator-quotes.json`

**288** line-quote entries used as a **line-quote geometry test**: each quote must resolve to consecutive native words with a bbox (`l001-locator-quotes.test.ts` via `extractNativeWords`). This is **not** a study-locator or Engine 2 claim test.

Regenerate from recovered lines (review diff before commit):

```bash
pnpm --filter @hiveforyou/intake exec node scripts/generate-l001-locator-quotes.mjs
```

Generator: `engine/intake/scripts/generate-l001-locator-quotes.mjs` (and `.ts` twin) — walks `recoverNormalizedDocument` → `page.lines[].text` (length 12–140).

Provenance commit: *(set when first committed to git)*.
