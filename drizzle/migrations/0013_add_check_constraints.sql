-- Business-rule CHECK constraints: enforce invariants at the DB level so a
-- bug or direct SQL cannot silently violate them.

-- Payments: amount must be positive and within JS safe-integer range.
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_positive"
  CHECK ("amount" > 0 AND "amount" <= 9007199254740991);

-- Projects: projectValue, when set, must be non-negative and safe.
ALTER TABLE "project" ADD CONSTRAINT "project_value_nonneg"
  CHECK ("project_value" IS NULL OR ("project_value" >= 0 AND "project_value" <= 9007199254740991));

-- Equipment: purchasePrice, when set, must be non-negative and safe.
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_price_nonneg"
  CHECK ("purchase_price" IS NULL OR ("purchase_price" >= 0 AND "purchase_price" <= 9007199254740991));

-- Project phases: weight must be positive (zero-weight phase is meaningless).
ALTER TABLE "project_phase" ADD CONSTRAINT "phase_weight_positive"
  CHECK ("weight" > 0);

-- Equipment usage: if ended, end must not precede start.
ALTER TABLE "equipment_usage" ADD CONSTRAINT "usage_time_order"
  CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

-- Audit log: immutable trail of sensitive admin operations.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "detail" jsonb,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" ("actor_id");
CREATE INDEX "audit_log_entity_idx" ON "audit_log" ("entity_type", "entity_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" ("created_at");
