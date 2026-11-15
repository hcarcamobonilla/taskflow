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
