CREATE TABLE "app_metadata" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_metadata_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_metadata" ("key", "value")
VALUES ('schema_version', 'step_1')
ON CONFLICT ("key") DO NOTHING;
