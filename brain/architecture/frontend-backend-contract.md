# Frontend–Backend Contract

- Frontend consumes **projections** of validated Case Intelligence — not raw model streams.
- Mutations: uploads, answers, explicit analysis requests, auth/payment — each maps to defined APIs later in `packages/shared` and `brain/contracts/`.
- Read paths must be safe to repeat without triggering new analysis.
- Pro gating is **entitlement on projection depth**, same case id and canonical revision.

Detailed DTOs: see contract docs under `brain/contracts/` (stubs until implemented).
