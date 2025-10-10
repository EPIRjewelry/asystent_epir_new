#!/usr/bin/env node
/**
 * Encoding Converter - Convert TypeScript files to UTF-8 without BOM
 * 
 * This script recursively scans TypeScript files in a directory,
 * detects BOM (Byte Order Mark) encodings, creates backups,
 * and converts files to UTF-8 without BOM.
 * 
 * Usage:
 *   npx tsx worker/scripts/convert-encodings.ts --dir=worker/src
 *   npx tsx worker/scripts/convert-encodings.ts --dir=worker/src --commit
 * 
 * Options:
 *   --dir=<path>      Directory to scan (default: worker/src)
 *   --commit          Enable automatic commit (confirmed by user)
 */

import * as fs from 'fs';
import * as path from 'path';

// BOM (Byte Order Mark) signatures
const BOM_SIGNATURES = {
  'utf8-bom': Buffer.from([0xEF, 0xBB, 0xBF]),
  'utf16-le': Buffer.from([0xFF, 0xFE]),
  'utf16-be': Buffer.from([0xFE, 0xFF]),
} as const;

type BOMType = keyof typeof BOM_SIGNATURES | null;

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  dir: 'worker/src',
  commit: false,
};

for (const arg of args) {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1];
  } else if (arg === '--commit') {
    options.commit = true;
  }
}

/**
 * Detect BOM type in a file
 */
function detectBOM(filePath: string): BOMType {
  const buffer = fs.readFileSync(filePath);
  
  // Check for each BOM signature
  for (const [type, signature] of Object.entries(BOM_SIGNATURES)) {
    if (buffer.length >= signature.length) {
      const fileStart = buffer.slice(0, signature.length);
      if (fileStart.equals(signature)) {
        return type as BOMType;
      }
    }
  }
  
  return null;
}

/**
 * Create backup file
 */
function createBackup(filePath: string): void {
  const backupPath = `${filePath}.bak`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`  ✓ Created backup: ${backupPath}`);
}

/**
 * Convert file to UTF-8 without BOM
 */
function convertToUTF8(filePath: string, bomType: BOMType): void {
  const buffer = fs.readFileSync(filePath);
  
  let content: string;
  
  // Remove BOM and decode to string
  if (bomType === 'utf8-bom') {
    const bomSize = BOM_SIGNATURES['utf8-bom'].length;
    content = buffer.slice(bomSize).toString('utf8');
  } else if (bomType === 'utf16-le') {
    const bomSize = BOM_SIGNATURES['utf16-le'].length;
    content = buffer.slice(bomSize).toString('utf16le');
  } else if (bomType === 'utf16-be') {
    // UTF-16 BE is not directly supported by Node.js Buffer
    // We need to swap bytes and use utf16le
    const bomSize = BOM_SIGNATURES['utf16-be'].length;
    const beBuffer = buffer.slice(bomSize);
    const leBuffer = Buffer.alloc(beBuffer.length);
    for (let i = 0; i < beBuffer.length; i += 2) {
      if (i + 1 < beBuffer.length) {
        leBuffer[i] = beBuffer[i + 1];
        leBuffer[i + 1] = beBuffer[i];
      }
    }
    content = leBuffer.toString('utf16le');
  } else {
    // No BOM, assume UTF-8
    content = buffer.toString('utf8');
  }
  
  // Write back as UTF-8 without BOM
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✓ Converted to UTF-8 (no BOM): ${filePath}`);
}

/**
 * Recursively find all .ts files in a directory
 */
function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively search subdirectories
      files.push(...findTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Process a single file
 */
function processFile(filePath: string): boolean {
  const bomType = detectBOM(filePath);
  
  if (bomType) {
    console.log(`\n📄 Processing: ${filePath}`);
    console.log(`  ⚠️  Detected BOM: ${bomType}`);
    
    // Create backup
    createBackup(filePath);
    
    // Convert to UTF-8 without BOM
    convertToUTF8(filePath, bomType);
    
    return true;
  }
  
  return false;
}

/**
 * Main function
 */
function main(): number {
  console.log('🔄 Encoding Converter - UTF-8 without BOM\n');
  
  // Resolve directory path (support both relative and absolute)
  const targetDir = path.isAbsolute(options.dir) ? options.dir : path.resolve(process.cwd(), options.dir);
  
  console.log(`Directory: ${targetDir}`);
  console.log(`Auto-commit: ${options.commit ? 'enabled' : 'disabled'}\n`);
  
  // Validate directory
  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Error: Directory not found: ${targetDir}`);
    return 1;
  }
  
  // Find all TypeScript files
  const files = findTypeScriptFiles(targetDir);
  console.log(`📁 Found ${files.length} TypeScript files\n`);
  
  if (files.length === 0) {
    console.log('✓ No TypeScript files found');
    return 0;
  }
  
  // Process each file
  let convertedCount = 0;
  const errors: string[] = [];
  
  for (const file of files) {
    try {
      const converted = processFile(file);
      if (converted) {
        convertedCount++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${file}: ${errorMsg}`);
      console.error(`❌ Error processing ${file}: ${errorMsg}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Total files scanned: ${files.length}`);
  console.log(`  Files converted: ${convertedCount}`);
  console.log(`  Errors: ${errors.length}`);
  
  if (convertedCount > 0) {
    console.log('\n✅ Conversion complete!');
    console.log('   Backup files created with .bak extension');
  } else {
    console.log('\n✓ All files are already UTF-8 without BOM');
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors occurred:');
    errors.forEach(err => console.log(`  - ${err}`));
    return 1;
  }
  
  return 0;
}

// Run main function and exit with appropriate code
const exitCode = main();
process.exit(exitCode);
