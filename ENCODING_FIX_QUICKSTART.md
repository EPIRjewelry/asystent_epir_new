# Encoding Fix Quick Start Guide

## Problem

Build for Cloudflare Worker fails with error:
```
Unexpected "\xff" (UTF-16 / bad encoding)
```

This happens when TypeScript files are encoded in UTF-16 or have a UTF-8 BOM (Byte Order Mark).

## Quick Fix

### Step 1: Check for Encoding Issues

```bash
npx tsx worker/scripts/remove-bom.ts --dry-run
```

This will scan all files and report any encoding issues without making changes.

### Step 2: Apply the Fix

```bash
npx tsx worker/scripts/remove-bom.ts --apply
```

This will:
- ✅ Convert all files to UTF-8 without BOM
- ✅ Create timestamped backups (e.g., `file.ts.bak.20251010_163059`)
- ✅ Generate a detailed JSON report

### Step 3: Verify

```bash
npx tsx worker/scripts/remove-bom.ts --dry-run
```

Should show: `✅ All files are correctly encoded (UTF-8 without BOM)`

## Advanced Usage

### Check Specific Directory
```bash
npx tsx worker/scripts/remove-bom.ts --dir=worker/src --dry-run
```

### Check Single File
```bash
npx tsx worker/scripts/remove-bom.ts --file=worker/src/index.ts --dry-run
```

### Custom File Extensions
```bash
npx tsx worker/scripts/remove-bom.ts --extensions=.ts,.tsx,.js --dry-run
```

### Custom Ignore Patterns
```bash
npx tsx worker/scripts/remove-bom.ts --ignore=node_modules,.git,dist --dry-run
```

## GitHub Actions

The repository includes an automated encoding check workflow that runs on every push/PR:

- **Location:** `.github/workflows/check-encoding.yml`
- **Triggers:** Push/PR to main/develop, manual trigger
- **Behavior:** Dry-run only (never auto-applies)
- **Output:** Uploads `encoding-report.json` as artifact
- **PR Comments:** Adds comment if issues found

### View Workflow Results

1. Go to GitHub Actions tab
2. Select "Check File Encodings" workflow
3. Download `encoding-report` artifact for details

## Understanding the Report

The script generates `encoding-report.json` with details like:

```json
{
  "timestamp": "2025-10-10T16:31:31.759Z",
  "filesScanned": 26,
  "filesNeedingConversion": 0,
  "files": [
    {
      "path": "/path/to/file.ts",
      "encoding": "utf-8",
      "hasBOM": false,
      "needsConversion": false,
      "converted": false
    }
  ]
}
```

## What Gets Fixed

### UTF-8 with BOM
**Before:** `EF BB BF 2F 2F ...` (BOM + //)  
**After:** `2F 2F ...` (no BOM)

### UTF-16LE
**Before:** `2F 00 2F 00 ...` (UTF-16LE)  
**After:** `2F 2F ...` (UTF-8)

### UTF-16BE
**Before:** `00 2F 00 2F ...` (UTF-16BE)  
**After:** `2F 2F ...` (UTF-8)

## Safety Features

1. **Dry-run by default** - Must explicitly use `--apply`
2. **Timestamped backups** - Original files backed up as `.bak.YYYYMMDD_HHMMSS`
3. **Idempotent** - Safe to run multiple times
4. **Deterministic** - Same input always produces same output
5. **No auto-apply in CI** - Manual intervention required

## Troubleshooting

### Issue: Script not found
```bash
# Install tsx if needed
npm install -g tsx
```

### Issue: Files still have encoding issues after fix
```bash
# Check if files are in a .gitignore'd directory
# The script respects ignore patterns
```

### Issue: Want to restore from backup
```bash
# Find backup files
ls -la *.bak.*

# Restore manually
cp file.ts.bak.20251010_163059 file.ts
```

## Documentation

- **Script Details:** [worker/scripts/README.md](worker/scripts/README.md)
- **Test Results:** [ENCODING_TEST_SUMMARY.md](ENCODING_TEST_SUMMARY.md)
- **Main README:** [README.md](README.md)

## Support

If you encounter issues:
1. Check the JSON report for details
2. Review backup files to ensure data safety
3. Run with `--dry-run` first to preview changes
4. Contact the development team with the report

---

**Last Updated:** 2025-10-10  
**Script Version:** 1.0.0  
**Maintained By:** EPIRjewelry Development Team
