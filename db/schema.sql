-- Esquema de TaskFlow. Es idempotente: puede ejecutarse varias veces sin borrar datos.

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       VARCHAR(150) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT CHECK (char_length(description) <= 2000),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high')),
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);

-- Mantiene updated_at al día en cada UPDATE, sin depender del código de la aplicación.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
