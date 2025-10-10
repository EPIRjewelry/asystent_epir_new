#!/usr/bin/env node
/**
 * Encoding Conversion & BOM Removal Script
 * 
 * Safely converts files to UTF-8 encoding and removes BOM (Byte Order Mark).
 * Designed to fix "Unexpected \xff" (UTF-16 / bad encoding) build errors.
 * 
 * Usage:
 *   npx tsx worker/scripts/remove-bom.ts --dry-run              # Preview changes (default)
 *   npx tsx worker/scripts/remove-bom.ts --apply                # Apply conversions with backups
 *   npx tsx worker/scripts/remove-bom.ts --dir=worker/src       # Check specific directory
 *   npx tsx worker/scripts/remove-bom.ts --file=worker/src/index.ts  # Check specific file
 *   npx tsx worker/scripts/remove-bom.ts --extensions=.ts,.tsx  # Custom extensions
 *   npx tsx worker/scripts/remove-bom.ts --ignore=node_modules,.git  # Ignore patterns
 *   npx tsx worker/scripts/remove-bom.ts --force                # Skip confirmations
 * 
 * Options:
 *   --dry-run            Preview changes without applying (default)
 *   --apply              Apply conversions and create timestamped backups
 *   --dir=<path>         Directory to scan (default: worker)
 *   --file=<path>        Single file to process
 *   --extensions=<list>  Comma-separated file extensions (default: .ts,.tsx,.js,.jsx)
 *   --ignore=<patterns>  Comma-separated ignore patterns (default: node_modules,.git,.wrangler,dist,build)
 *   --force              Skip confirmation prompts
 * 
 * Output:
 *   - Generates a JSON report of all files checked and converted
 *   - Creates timestamped backups: file.bak.YYYYMMDD_HHMMSS
 *   - Idempotent: safe to run multiple times
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Parse command-line arguments
interface Options {
  dryRun: boolean;
  apply: boolean;
  dir: string;
  file: string | null;
  extensions: string[];
  ignore: string[];
  force: boolean;
}

const args = process.argv.slice(2);
const options: Options = {
  dryRun: true,
  apply: false,
  dir: 'worker',
  file: null,
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  ignore: ['node_modules', '.git', '.wrangler', 'dist', 'build'],
  force: false,
};

// Parse arguments
for (const arg of args) {
  if (arg === '--dry-run') {
    options.dryRun = true;
    options.apply = false;
  } else if (arg === '--apply') {
    options.apply = true;
    options.dryRun = false;
  } else if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1];
  } else if (arg.startsWith('--file=')) {
    options.file = arg.split('=')[1];
  } else if (arg.startsWith('--extensions=')) {
    options.extensions = arg.split('=')[1].split(',').map(ext => ext.trim());
  } else if (arg.startsWith('--ignore=')) {
    options.ignore = arg.split('=')[1].split(',').map(pattern => pattern.trim());
  } else if (arg === '--force') {
    options.force = true;
  }
}

interface FileReport {
  path: string;
  encoding: string;
  hasBOM: boolean;
  needsConversion: boolean;
  converted: boolean;
  backupPath?: string;
  error?: string;
}

interface ScanReport {
  timestamp: string;
  options: Options;
  filesScanned: number;
  filesNeedingConversion: number;
  filesConverted: number;
  files: FileReport[];
}

/**
 * Detect file encoding and BOM presence
 */
function detectEncoding(filePath: string): { encoding: string; hasBOM: boolean } {
  const buffer = fs.readFileSync(filePath);
  
  // Check for UTF-8 BOM (EF BB BF)
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return { encoding: 'utf-8', hasBOM: true };
  }
  
  // Check for UTF-16 LE BOM (FF FE)
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { encoding: 'utf-16le', hasBOM: true };
  }
  
  // Check for UTF-16 BE BOM (FE FF)
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return { encoding: 'utf-16be', hasBOM: true };
  }
  
  // Try to detect UTF-16 without BOM by looking for null bytes
  let nullCount = 0;
  const sampleSize = Math.min(buffer.length, 1000);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      nullCount++;
    }
  }
  
  // If more than 10% null bytes, likely UTF-16
  if (nullCount > sampleSize * 0.1) {
    // Check if nulls are at even or odd positions
    const evenNulls = buffer.slice(0, sampleSize).filter((_, i) => i % 2 === 1 && buffer[i] === 0).length;
    const oddNulls = buffer.slice(0, sampleSize).filter((_, i) => i % 2 === 0 && buffer[i] === 0).length;
    
    if (evenNulls > oddNulls) {
      return { encoding: 'utf-16le', hasBOM: false };
    } else if (oddNulls > evenNulls) {
      return { encoding: 'utf-16be', hasBOM: false };
    }
  }
  
  // Default to UTF-8 without BOM
  return { encoding: 'utf-8', hasBOM: false };
}

/**
 * Convert file to UTF-8 without BOM
 */
function convertFile(filePath: string, report: FileReport, options: Options): void {
  try {
    const buffer = fs.readFileSync(filePath);
    let content: string;
    
    // Decode based on detected encoding
    if (report.encoding === 'utf-16le') {
      content = buffer.toString('utf16le');
    } else if (report.encoding === 'utf-16be') {
      // Node.js doesn't have built-in UTF-16BE support, swap bytes manually
      const swapped = Buffer.allocUnsafe(buffer.length);
      for (let i = 0; i < buffer.length - 1; i += 2) {
        swapped[i] = buffer[i + 1];
        swapped[i + 1] = buffer[i];
      }
      content = swapped.toString('utf16le');
    } else {
      // UTF-8, remove BOM if present
      content = buffer.toString('utf-8');
      if (report.hasBOM && content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
    }
    
    if (options.apply) {
      // Create timestamped backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      const backupPath = `${filePath}.bak.${timestamp}`;
      fs.copyFileSync(filePath, backupPath);
      report.backupPath = backupPath;
      
      // Write UTF-8 without BOM
      fs.writeFileSync(filePath, content, 'utf-8');
      report.converted = true;
      
      console.log(`  ✅ Converted: ${filePath}`);
      console.log(`     Backup: ${backupPath}`);
    } else {
      console.log(`  ⚠️  Would convert: ${filePath} (${report.encoding}${report.hasBOM ? ' with BOM' : ''})`);
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Error processing ${filePath}: ${report.error}`);
  }
}

/**
 * Recursively scan directory for files
 */
function* scanDirectory(dirPath: string, options: Options): Generator<string> {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // Check if should ignore
    if (options.ignore.some(pattern => entry.name.includes(pattern) || fullPath.includes(pattern))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      yield* scanDirectory(fullPath, options);
    } else if (entry.isFile()) {
      // Check if file has matching extension
      const ext = path.extname(entry.name);
      if (options.extensions.includes(ext)) {
        yield fullPath;
      }
    }
  }
}

/**
 * Get list of files to process
 */
function getFilesToProcess(options: Options): string[] {
  if (options.file) {
    // Single file mode
    if (!fs.existsSync(options.file)) {
      console.error(`Error: File not found: ${options.file}`);
      process.exit(1);
    }
    return [options.file];
  } else {
    // Directory scan mode
    const dirPath = path.resolve(options.dir);
    if (!fs.existsSync(dirPath)) {
      console.error(`Error: Directory not found: ${dirPath}`);
      process.exit(1);
    }
    return Array.from(scanDirectory(dirPath, options));
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Encoding Conversion & BOM Removal Script');
  console.log('==========================================\n');
  console.log(`Mode: ${options.apply ? '🔧 APPLY (with backups)' : '👀 DRY-RUN (preview only)'}`);
  console.log(`Target: ${options.file || options.dir}`);
  console.log(`Extensions: ${options.extensions.join(', ')}`);
  console.log(`Ignore: ${options.ignore.join(', ')}\n`);
  
  // Get files to process
  const files = getFilesToProcess(options);
  console.log(`📁 Found ${files.length} files to check\n`);
  
  if (files.length === 0) {
    console.log('✅ No files found matching criteria.');
    process.exit(0);
  }
  
  // Scan and build report
  const report: ScanReport = {
    timestamp: new Date().toISOString(),
    options,
    filesScanned: 0,
    filesNeedingConversion: 0,
    filesConverted: 0,
    files: [],
  };
  
  console.log('🔎 Scanning files...\n');
  
  for (const filePath of files) {
    const { encoding, hasBOM } = detectEncoding(filePath);
    const needsConversion = encoding !== 'utf-8' || hasBOM;
    
    const fileReport: FileReport = {
      path: filePath,
      encoding,
      hasBOM,
      needsConversion,
      converted: false,
    };
    
    report.filesScanned++;
    
    if (needsConversion) {
      report.filesNeedingConversion++;
      convertFile(filePath, fileReport, options);
      if (fileReport.converted) {
        report.filesConverted++;
      }
    }
    
    report.files.push(fileReport);
  }
  
  // Print summary
  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Files scanned: ${report.filesScanned}`);
  console.log(`Files needing conversion: ${report.filesNeedingConversion}`);
  
  if (options.apply) {
    console.log(`Files converted: ${report.filesConverted}`);
    if (report.filesConverted > 0) {
      console.log(`\n✅ Conversion complete! Backups created with .bak.YYYYMMDD_HHMMSS extension.`);
    }
  } else {
    console.log(`\n💡 This was a dry-run. Use --apply to perform conversions with backups.`);
  }
  
  // Save report to JSON file
  const reportPath = path.join(process.cwd(), 'encoding-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 Report saved to: ${reportPath}`);
  
  // Exit with error code if conversions are needed but not applied
  if (report.filesNeedingConversion > 0 && !options.apply) {
    console.log('\n⚠️  Files with encoding issues detected. Run with --apply to fix.');
    process.exit(1);
  } else if (report.filesNeedingConversion === 0) {
    console.log('\n✅ All files are correctly encoded (UTF-8 without BOM).');
    process.exit(0);
  } else {
    process.exit(0);
  }
}

// Run main function
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
