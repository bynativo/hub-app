-- Cron job diario: genera instancias automáticas de recurrentes.
-- Se ejecuta a las 11:00 UTC (07:00 hora Chile, UTC-4) todos los días.
select cron.schedule(
  'generate_recurrentes',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/generate-recurrentes',
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    )
  $$
);
