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

-- ---------- Tablero Kanban ----------
-- Las tarjetas del tablero son independientes de la tabla tasks.
-- position guarda el orden (0 = primera): de las columnas en el tablero y de las
-- tarjetas dentro de su columna. La aplicación la renumera dentro de una transacción.

CREATE TABLE IF NOT EXISTS kanban_columns (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(60) NOT NULL CHECK (char_length(btrim(name)) > 0),
  position   INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Al eliminar una columna, PostgreSQL elimina también sus tarjetas.
  column_id   INTEGER NOT NULL REFERENCES kanban_columns (id) ON DELETE CASCADE,
  title       VARCHAR(150) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT CHECK (char_length(description) <= 2000),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high')),
  due_date    DATE,
  position    INTEGER NOT NULL CHECK (position >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards (column_id, position);

CREATE OR REPLACE TRIGGER kanban_columns_set_updated_at
  BEFORE UPDATE ON kanban_columns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER kanban_cards_set_updated_at
  BEFORE UPDATE ON kanban_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Datos del tablero como proyecto. Hay una sola fila (id = 1).
--   name y description: una cadena vacía significa "sin definir".
--   completed_count: cuántas tareas se han completado (al completarse, la tarea se elimina).
CREATE TABLE IF NOT EXISTS kanban_project (
  id              SMALLINT PRIMARY KEY CHECK (id = 1),
  name            VARCHAR(100) NOT NULL DEFAULT '',
  description     VARCHAR(300) NOT NULL DEFAULT '',
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Para bases creadas antes de que existiera el contador (no hace nada si la columna ya está).
ALTER TABLE kanban_project
  ADD COLUMN IF NOT EXISTS completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0);

INSERT INTO kanban_project (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER kanban_project_set_updated_at
  BEFORE UPDATE ON kanban_project
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
