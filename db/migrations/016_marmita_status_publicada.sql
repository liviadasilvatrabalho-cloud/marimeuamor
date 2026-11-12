-- Migration 016: Ajuste de constraint de status de marmita
-- Inclui 'publicada' para permitir que Livia publique marmitas visiveis a Mariana.
-- Our Little Kitchen - Neon Postgres

-- Recria o check constraint incluindo 'publicada'
ALTER TABLE marmitas DROP CONSTRAINT IF EXISTS marmitas_status_check;

ALTER TABLE marmitas
ADD CONSTRAINT marmitas_status_check
CHECK (status IN ('preparada','entregue','consumida','cancelada','publicada'));

COMMENT ON CONSTRAINT marmitas_status_check ON marmitas IS 'Status da marmita: publicada permite que Mariana visualize, mas so Livia (admin) altera marmitas publicadas.';
