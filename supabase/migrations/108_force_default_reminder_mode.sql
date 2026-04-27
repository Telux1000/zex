-- Force all reminder copy presets to Default mode across existing workspaces.
-- Keeps saved subject/message text intact so users can switch back to Customize later.
UPDATE public.businesses
SET reminder_messaging = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(reminder_messaging, '{"version":1,"presets":{}}'::jsonb),
        '{presets,before_due,enabled}',
        'false'::jsonb,
        true
      ),
      '{presets,due_today,enabled}',
      'false'::jsonb,
      true
    ),
    '{presets,overdue,enabled}',
    'false'::jsonb,
    true
  ),
  '{presets,final_reminder,enabled}',
  'false'::jsonb,
  true
);

UPDATE public.businesses
SET reminder_messaging = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(reminder_messaging, '{"version":1,"presets":{}}'::jsonb),
        '{presets,before_due,use_custom_copy}',
        'false'::jsonb,
        true
      ),
      '{presets,due_today,use_custom_copy}',
      'false'::jsonb,
      true
    ),
    '{presets,overdue,use_custom_copy}',
    'false'::jsonb,
    true
  ),
  '{presets,final_reminder,use_custom_copy}',
  'false'::jsonb,
  true
);
