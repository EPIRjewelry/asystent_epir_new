# TODO (persisted)

This file is a workspace-persisted TODO exported from the agent session. It is independent from the agent's internal `manage_todo_list` state. Commit & push this file to make it available to other machines / GitHub.

## Current tasks (from agent session)

- [x] Analysis of current architecture and mapping to the prompt engineering document
- [x] Design new System Prompt (Llama 3.3 + Shopify MCP)
- [x] Implement Intent Classification + Entity Resolution (LLM-based) — `worker/src/services/intent.ts`
- [x] Refactor orchestration logic in `worker/src/index.ts` (intent -> CoT -> tool-calls)
- [x] Customer Context Integration (D1 + SessionDO) — `worker/src/services/customer-context.ts`
- [ ] Unit & integration tests (Vitest) for intent, groq, index
- [ ] Deployment plan & monitoring (A/B tests, metrics)
- [x] Architectural Q&A: prompt length, MCP as source-of-truth, agent capabilities

## Notes about agent-managed TODO vs persisted TODO

- The agent has an internal managed todo list (used for session planning). That list is stored in the agent/tool state and is NOT automatically written to the git repo or GitHub. If you open VS Code on another machine, you will only see changes from the git repo/pushed commits.

- To ensure other environments (or collaborators) see the same TODO, you must commit & push this file to the remote repository.

## How to persist and sync (recommended)

1. Stage and commit the file on your current machine:

```powershell
cd "F:\EPIR-ART-JEWELLERY"
git checkout -b fix/persist-todo
git add TODO.md
git commit -m "chore: add persisted TODO for refactor plan"
git push --set-upstream origin fix/persist-todo
```

2. Open VS Code on another machine, pull the branch or checkout the branch and you'll have the same TODO.

## Alternatives

- Create GitHub issues (one per task) or a GitHub Project/Board — better for tracking, assignees, PR linking.
- Use a dedicated task file (e.g., `docs/TODO.md`) or add tasks to `README`.

If you want, I can:
- create and push the branch for you now (I will run git commands), or
- create GitHub issues instead (requires permission/API access).

Tell me which action you want: commit & push now, create issues, or just leave this file for manual commit.