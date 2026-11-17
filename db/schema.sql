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
  -- Límite WIP (trabajo en curso): NULL significa "sin límite". Es un aviso, no un bloqueo.
  wip_limit  INTEGER CHECK (wip_limit BETWEEN 1 AND 50),
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
