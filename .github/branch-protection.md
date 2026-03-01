# Branch Protection Rules — `main`

This document describes the branch protection rules configured for the `main` branch of the
`EPIRjewelry/asystent_epir_new` repository.  
Rules are applied automatically by the workflow
[`.github/workflows/apply-branch-protection.yml`](./workflows/apply-branch-protection.yml)
or manually using the commands in [`.github/README.md`](./README.md).

---

## Configured rules

| # | Rule | Value |
|---|------|-------|
| 1 | Require pull request reviews before merging | ✅ enabled — minimum **1** approving review |
| 2 | Dismiss stale PR approvals when new commits are pushed | ✅ enabled |
| 3 | Require status checks to pass before merging | ✅ enabled |
| 4 | Required status checks | `build`, `lint`, `typecheck` |
| 5 | Require branches to be up to date before merging | ✅ enabled |
| 6 | Require signed commits | ❌ disabled |
| 7 | Require linear history | ❌ disabled (merge commits allowed) |
| 8 | Restrict who can push to matching branches | ❌ not restricted |
| 9 | Enforce rules for administrators | ✅ enabled |

---

## Changing the rules

1. Open an issue using the
   [Branch Protection Change](./ISSUE_TEMPLATE/branch-protection-change.md) template.
2. Get at least one review approval.
3. After merging, the workflow re-applies the updated rules automatically.

Alternatively, apply the rules manually — see [`.github/README.md`](./README.md).
