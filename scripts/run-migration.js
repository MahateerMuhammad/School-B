#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs a SQL migration file against the database
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration(migrationFile) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        console.log(`Running migration: ${migrationFile}`);

        const sqlPath = path.join(__dirname, '..', 'migrations', migrationFile);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await pool.query(sql);

        console.log('✓ Migration completed successfully');
    } catch (error) {
        console.error('✗ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('Usage: node run-migration.js <migration-file>');
    console.error('Example: node run-migration.js 005_add_discounts_and_due_date.sql');
    process.exit(1);
}

runMigration(migrationFile);
