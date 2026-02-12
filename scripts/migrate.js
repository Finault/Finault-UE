#!/usr/bin/env node
/**
 * FINAULT DATABASE MIGRATION RUNNER
 * Executes SQL migrations in order against Supabase
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'database/migrations');

async function migrate() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
    console.error('   Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npm run db:migrate');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get migration files in order
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`\n📋 Found ${files.length} migration(s):\n`);

  // Check which have already been applied
  const { data: applied } = await supabase
    .from('schema_migrations')
    .select('filename')
    .catch(() => ({ data: [] }));

  const appliedSet = new Set((applied || []).map(r => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ⏭  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`  ▶  ${file} ...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
      if (error) throw error;

      // Record migration
      await supabase.from('schema_migrations').insert({
        filename: file,
        applied_at: new Date().toISOString()
      });

      console.log(`  ✅ ${file}`);
    } catch (error) {
      console.error(`  ❌ ${file}: ${error.message}`);
      console.error(`\n  Migration failed. Fix the error and re-run.`);
      process.exit(1);
    }
  }

  // Also run base schema and functions if fresh install
  if (appliedSet.size === 0) {
    console.log('\n  Running base schema...');
    for (const base of ['schema.sql', 'functions.sql', 'rls-policies.sql']) {
      const basePath = path.join(ROOT, 'database', base);
      try {
        const sql = readFileSync(basePath, 'utf-8');
        const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
        if (error) console.log(`  ⚠ ${base}: ${error.message} (may already exist)`);
        else console.log(`  ✅ ${base}`);
      } catch (e) {
        console.log(`  ⚠ ${base}: ${e.message}`);
      }
    }
  }

  console.log('\n✅ Migrations complete\n');
}

migrate().catch(console.error);
