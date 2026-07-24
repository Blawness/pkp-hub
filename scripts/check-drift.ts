import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "../lib/db/index";
import * as schema from "../lib/db/schema";

async function main() {
  const dbCols = await db.execute<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(sql`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);

  const dbIndexes = await db.execute<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>(sql`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname NOT LIKE '%_pk' AND indexname NOT LIKE '%_pkey'
  ORDER BY tablename, indexname
`);

  const dbFks = await db.execute<{
    table_name: string;
    constraint_name: string;
    delete_rule: string;
    update_rule: string;
  }>(sql`
  SELECT tc.table_name, tc.constraint_name, rc.delete_rule, rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  ORDER BY tc.table_name, tc.constraint_name
`);

  const dbEnums = await db.execute<{ typname: string; enumlabel: string }>(sql`
  SELECT t.typname, e.enumlabel
  FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  ORDER BY t.typname, e.enumsortorder
`);

  // Build DB maps
  const colMap = new Map<
    string,
    Map<string, { type: string; nullable: string; default: string | null }>
  >();
  for (const r of dbCols.rows) {
    if (!colMap.has(r.table_name)) colMap.set(r.table_name, new Map());
    colMap.get(r.table_name)?.set(r.column_name, {
      type: r.data_type,
      nullable: r.is_nullable,
      default: r.column_default,
    });
  }

  const enumMap = new Map<string, Set<string>>();
  for (const r of dbEnums.rows) {
    if (!enumMap.has(r.typname)) enumMap.set(r.typname, new Set());
    enumMap.get(r.typname)?.add(r.enumlabel);
  }

  // Iterate schema
  let totalDrift = 0;
  for (const [, value] of Object.entries(schema)) {
    const t: any = value;
    if (!t || typeof t !== "object" || !t[Symbol.for("drizzle:Name")]) continue;
    const tableName: string = getTableName(t);
    const config = getTableConfig(t);
    const cols = getTableColumns(t);

    // Check table exists
    if (!colMap.has(tableName)) {
      console.log(`[${tableName}] TABLE MISSING in DB`);
      totalDrift++;
      continue;
    }

    const dbC = colMap.get(tableName)!;
    const issues: string[] = [];

    // Check indexes (includes column-level unique constraints)
    const configIndexes = new Set<string>();
    for (const idx of (config as any).indexes ?? []) {
      configIndexes.add(idx.config.name);
    }
    // Column-level unique constraints also create indexes
    for (const col of Object.values(cols) as any[]) {
      if (col.config?.isUnique && col.config.uniqueName) {
        configIndexes.add(col.config.uniqueName);
      }
    }
    const dbIdxSet = new Set(
      (dbIndexes.rows as any[]).filter((r) => r.tablename === tableName).map((r) => r.indexname),
    );
    for (const idxName of configIndexes)
      if (!dbIdxSet.has(idxName)) issues.push(`  - index "${idxName}" missing in DB`);
    for (const idxName of dbIdxSet)
      if (!configIndexes.has(idxName))
        issues.push(`  + index "${idxName}" extra in DB (not in schema)`);

    // Check columns
    for (const [, col] of Object.entries(cols) as [string, any][]) {
      const dbColName: string = col.name;
      const dbCol = dbC.get(dbColName);
      if (!dbCol) {
        issues.push(`  - column "${dbColName}" missing in DB`);
        continue;
      }
      const sqlType = col.getSQLType();
      // Normalize: "timestamp with/without time zone" → "timestamp"; enums → "USER-DEFINED" in information_schema
      const normalize = (s: string) =>
        s.replace(/\s*with time zone$/, "").replace(/\s*without time zone$/, "");
      const isEnum = !!(col.enumValues && Array.isArray(col.enumValues) && col.enumValues.length);
      const normDb = dbCol.type === "USER-DEFINED" ? "USER-DEFINED" : normalize(dbCol.type);
      const normSchema = isEnum ? "USER-DEFINED" : normalize(sqlType);
      if (normDb !== normSchema) {
        issues.push(`  - column "${dbColName}" type mismatch: db=${dbCol.type} schema=${sqlType}`);
      }
      const expectedNullable = col.notNull ? "NO" : "YES";
      if (dbCol.nullable !== expectedNullable) {
        issues.push(
          `  - column "${dbColName}" nullability mismatch: db=${dbCol.nullable} schema=${expectedNullable}`,
        );
      }
    }
    // Check extra columns in DB
    for (const dbColName of dbC.keys()) {
      const found = Object.values(cols).some((c: any) => c.name === dbColName);
      if (!found) {
        issues.push(`  + column "${dbColName}" extra in DB (not in schema)`);
      }
    }

    // Check enums
    for (const enumCol of Object.values(cols) as any[]) {
      if (enumCol.enumValues && enumCol.enumName) {
        const dbLabels = enumMap.get(enumCol.enumName);
        const schemaLabels = new Set<string>(enumCol.enumValues as string[]);
        if (!dbLabels) {
          issues.push(`  - enum "${enumCol.enumName}" missing in DB`);
        } else {
          for (const lbl of schemaLabels)
            if (!dbLabels.has(lbl))
              issues.push(`  - enum "${enumCol.enumName}" missing label "${lbl}"`);
          for (const lbl of dbLabels)
            if (!schemaLabels.has(lbl))
              issues.push(`  + enum "${enumCol.enumName}" extra label "${lbl}"`);
        }
      }
    }

    if (issues.length) {
      console.log(`[${tableName}]`);
      for (const i of issues) console.log(i);
      totalDrift++;
    }
  }

  if (totalDrift === 0) {
    console.log("✓ No drift: DB schema matches lib/db/schema.ts");
  } else {
    console.log(`\n✗ Drift detected in ${totalDrift} table(s)`);
  }

  // Also check for tables in DB not in schema
  for (const tableName of colMap.keys()) {
    const found = Object.values(schema).some(
      (v: any) => v?.[Symbol.for("drizzle:Name")] && getTableName(v) === tableName,
    );
    if (!found) {
      console.log(`[${tableName}] EXTRA in DB (not in schema)`);
      totalDrift++;
    }
  }

  console.log(`\n--- summary ---`);
  console.log(`tables in DB: ${colMap.size}`);
  console.log(`enums in DB: ${enumMap.size}`);
  console.log(`indexes in DB: ${dbIndexes.rows.length}`);
  console.log(`FKs in DB: ${dbFks.rows.length}`);

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
