# PR: Non-invasive audit CI

Ten PR:
- [x] NIE zmienia logiki ani zachowania runtime aplikacji
- [x] Dodaje tylko pliki audytu/CI (workflows, dependabot, template PR)
- [x] Nie dodaje sekretów ani nie publikuje/deployuje

Co jest w tym PR:
- Audit CI (.github/workflows/audit.yml): npm ci, tsc --noEmit, npm test, opcjonalnie eslint, npm audit (report-only)
- CodeQL (.github/workflows/codeql.yml): skan bezpieczeństwa kodu
- Dependabot (.github/dependabot.yml): aktualizacje npm (Worker) i GitHub Actions
- Template PR (.github/pull_request_template.md): checklista audytu

Jak weryfikować:
- Sprawdź wyniki workflow "Audit (Non-invasive)" na tym PR
- Sprawdź ostrzeżenia z CodeQL (jeśli są)
- Brak zmian w istniejących plikach źródłowych aplikacji

Uwagi:
- Jeśli lint/tsconfig nie są skonfigurowane, kroki są pomijane (nie blokują PR)
- W razie potrzeby dodamy osobny PR z poprawkami wykrytych problemów (osobno od audytu)
