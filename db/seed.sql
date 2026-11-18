-- Datos de demostración (sin información personal).
-- Solo se insertan si la tabla está vacía, para no duplicarlos al repetir el script.

INSERT INTO tasks (title, description, status, priority, due_date)
SELECT v.title, v.description, v.status, v.priority, v.due_date
FROM (VALUES
  ('Diseñar el esquema de la base de datos', 'Definir la tabla tasks y sus restricciones.', 'completed',   'high',   CURRENT_DATE - 5),
  ('Implementar la API REST',                'Endpoints CRUD con validación y manejo de errores.', 'in_progress', 'high', CURRENT_DATE + 2),
  ('Escribir pruebas de integración',        'Probar endpoints contra PostgreSQL real.', 'pending', 'medium', CURRENT_DATE + 5),
  ('Mejorar la accesibilidad del formulario', NULL, 'pending', 'medium', NULL),
  ('Revisar la documentación',               'README y guía técnica.', 'pending', 'low', CURRENT_DATE + 10)
) AS v(title, description, status, priority, due_date)
WHERE NOT EXISTS (SELECT 1 FROM tasks);

-- Tablero Kanban de demostración. Solo se crea si el tablero no tiene ninguna columna;
-- las tarjetas se insertan únicamente en las columnas recién creadas.
WITH new_columns AS (
  INSERT INTO kanban_columns (name, position)
  SELECT v.name, v.position
  FROM (VALUES
    ('Por hacer', 0),
    ('En curso',  1),
    ('Hecho',     2)
  ) AS v(name, position)
  WHERE NOT EXISTS (SELECT 1 FROM kanban_columns)
  RETURNING id, name
)
INSERT INTO kanban_cards (column_id, title, description, priority, due_date, position)
SELECT c.id, v.title, v.description, v.priority, v.due_date, v.position
FROM (VALUES
  ('Por hacer', 'Preparar la demo del proyecto', 'Repasar el flujo completo antes de mostrarlo.', 'high',   CURRENT_DATE + 3, 0),
  ('Por hacer', 'Ordenar las capturas de pantalla', NULL,                                          'low',    NULL,             1),
  ('En curso',  'Escribir la guía técnica',         'Explicar la transacción al mover tarjetas.',  'medium', CURRENT_DATE + 7, 0),
  ('Hecho',     'Crear el esquema del tablero',     'Tablas kanban_columns y kanban_cards.',       'medium', NULL,             0)
) AS v(column_name, title, description, priority, due_date, position)
JOIN new_columns c ON c.name = v.column_name;
