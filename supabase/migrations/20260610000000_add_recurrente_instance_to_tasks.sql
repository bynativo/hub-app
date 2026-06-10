-- Columnas para identificar tareas generadas automáticamente por una recurrente.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS es_recurrente_instance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrente_id bigint REFERENCES recurrentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_recurrente_id_idx ON tasks(recurrente_id);
