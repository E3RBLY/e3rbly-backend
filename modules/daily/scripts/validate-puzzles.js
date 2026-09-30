#!/usr/bin/env node
const { loadPool } = require("../src/puzzles");

const minIndex = process.argv.indexOf("--min");
const min = minIndex > -1 ? Number.parseInt(process.argv[minIndex + 1], 10) : 0;

try {
  const pool = loadPool();
  if (pool.puzzles.length < min) {
    console.error(`daily puzzles: only ${pool.puzzles.length} puzzle(s), launch needs ${min}`);
    process.exit(1);
  }
  console.log(`daily puzzles OK: ${pool.puzzles.length} puzzle(s), review_status ${pool.reviewStatus}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
