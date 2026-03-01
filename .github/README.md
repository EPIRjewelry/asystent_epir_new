# .github — repository configuration

This directory contains GitHub-specific configuration for the
`EPIRjewelry/asystent_epir_new` repository.

| File / directory | Purpose |
|---|---|
| `branch-protection.md` | Human-readable description of branch protection rules |
| `CODEOWNERS` | Automatic review assignments |
| `ISSUE_TEMPLATE/branch-protection-change.md` | Issue template for requesting rule changes |
| `workflows/apply-branch-protection.yml` | Workflow that applies branch protection rules via the GitHub API |

---

## Applying branch protection rules manually

If you prefer to apply the rules without waiting for the workflow, run the commands below
from your local machine.  You need:

- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated.
- A token with **repo admin** permissions (either your personal access token or an org token).

### One-liner (recommended)

```bash
gh api \
  --method PUT \
  repos/EPIRjewelry/asystent_epir_new/branches/main/protection \
  --header "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["build", "lint", "typecheck"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false,
  "required_signatures": false
}
EOF
```

### Verifying the current rules

```bash
gh api repos/EPIRjewelry/asystent_epir_new/branches/main/protection \
  --header "Accept: application/vnd.github+json" | jq .
```

### Removing all protection rules (use with care!)

```bash
gh api \
  --method DELETE \
  repos/EPIRjewelry/asystent_epir_new/branches/main/protection \
  --header "Accept: application/vnd.github+json"
```

---

## Required `GH_TOKEN` secret

The workflow [`workflows/apply-branch-protection.yml`](./workflows/apply-branch-protection.yml)
reads the secret `GH_TOKEN`.  To set it up:

1. Go to **Settings → Secrets and variables → Actions** in the repository.
2. Click **New repository secret**.
3. Name: `GH_TOKEN`, Value: a fine-grained or classic PAT with
   at minimum the **`repo`** scope (classic) or **`Administration: Read and write`** permission
   (fine-grained).

> **Security note:** Never commit tokens or credentials to the repository.
> Always use GitHub Secrets.

---

## Updating the rules

1. Edit [`branch-protection.md`](./branch-protection.md) to reflect the desired state.
2. Edit the JSON payload in [`workflows/apply-branch-protection.yml`](./workflows/apply-branch-protection.yml).
3. Open a PR and get at least **1 approving review**.
4. On merge to `main`, the workflow automatically re-applies the updated rules.
