# Nudge maintenance

- Keep the application on free tiers. Do not add paid services or infrastructure.
- Every feature or bug fix that changes behavior must update the affected files in `docs/wiki` in the same change. Update `OpenAPI.yaml` when API contracts change.
- `docs/wiki` is the canonical technical documentation. The GitHub Wiki is generated from it. The `sync-wiki.yml` workflow publishes after a successful Vercel deployment of the latest `main` commit; confirm that it succeeds before reporting a deployment complete.
- Keep decision records and operating limits consistent with the source. Do not describe planned behavior as implemented.
- Never publish secrets, real credentials, database URLs or personal deployment addresses. Use synthetic examples. The public API documentation URL explicitly supplied by the owner may appear in the README.
- Keep the GitHub About website field empty. Do not add an application or personal website URL there.
- Preserve the proprietary license and copyright wording. The internal codename belongs only in source comments, not documentation or package metadata.
- Run checks appropriate to the change. Use the Wiki builder's link checks for documentation updates; test behavior changes and verify the production build for application changes.
