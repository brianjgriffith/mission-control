-- Migration 012: Add archive columns to students table
-- Allows hiding students from the roster without deleting them.
-- The sync pipeline will skip archived students (they still exist in the table).

ALTER TABLE students ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN archived_at timestamptz;

CREATE INDEX idx_students_archived ON students (archived);
