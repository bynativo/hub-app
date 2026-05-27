-- Separación estricta de contextos (banco / agencia / personal).
-- Una tarea no puede colgar de una tarea padre ni vincularse a un proyecto
-- de distinto contexto. Aplicado al proyecto remoto vía Supabase MCP.
--
-- Limpieza previa de datos: la subtarea 66 (agencia) colgaba del plan banco 36;
-- se alineó a 'banco' (UPDATE tasks SET context='banco' WHERE id=66).

CREATE OR REPLACE FUNCTION public.enforce_task_context_links()
RETURNS trigger AS $$
DECLARE
  parent_ctx text;
  proj_ctx text;
BEGIN
  IF NEW.parent_task_id IS NOT NULL THEN
    SELECT context INTO parent_ctx FROM tasks WHERE id = NEW.parent_task_id;
    IF parent_ctx IS NOT NULL AND parent_ctx <> NEW.context THEN
      RAISE EXCEPTION 'Separación de contexto: una subtarea (contexto %) no puede colgar de una tarea padre de contexto %', NEW.context, parent_ctx
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT context INTO proj_ctx FROM projects WHERE id = NEW.project_id;
    IF proj_ctx IS NOT NULL AND proj_ctx <> NEW.context THEN
      RAISE EXCEPTION 'Separación de contexto: una tarea (contexto %) no puede vincularse a un proyecto de contexto %', NEW.context, proj_ctx
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.enforce_task_context_links() SET search_path = public;

DROP TRIGGER IF EXISTS trg_task_context_links ON tasks;
CREATE TRIGGER trg_task_context_links
  BEFORE INSERT OR UPDATE OF parent_task_id, project_id, context ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_context_links();
