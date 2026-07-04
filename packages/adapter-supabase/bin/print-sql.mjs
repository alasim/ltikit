#!/usr/bin/env node
// Print the ltikit Supabase schema to stdout, so you can pipe it into a migration
// or a psql session without hunting through node_modules:
//
//   npx @ltikit/adapter-supabase > supabase/migrations/0001_ltikit.sql
//   npx @ltikit/adapter-supabase | psql "$DATABASE_URL"
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sqlPath = fileURLToPath(new URL('../sql/0001_ltikit_tables.sql', import.meta.url))
process.stdout.write(readFileSync(sqlPath, 'utf8'))
