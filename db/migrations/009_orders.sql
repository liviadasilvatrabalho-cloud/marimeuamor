-- Migration 009: Pedidos da Mariana (solicitações de marmitas)
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id   UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  requester_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,
  reference_photo_path TEXT,              -- caminho no Storage
  desired_ingredients TEXT,
  recipe_id          UUID REFERENCES recipes(id) ON DELETE SET NULL,
  observations       TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_preparacao','concluida','cancelada')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de alterações de status do pedido
CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status  TEXT NOT NULL,
  changed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_orders_space ON orders(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_orders_requester ON orders(requester_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_at ON order_status_history(changed_at DESC);

-- Trigger para registrar histórico de status automaticamente
CREATE OR REPLACE FUNCTION trg_order_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, changed_at)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.updated_by, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_status_history
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trg_order_status_history();

COMMENT ON TABLE orders IS 'Solicitações de marmitas da Mariana, visíveis para Lívia.';
COMMENT ON TABLE order_status_history IS 'Audit trail de mudanças de status dos pedidos.';
