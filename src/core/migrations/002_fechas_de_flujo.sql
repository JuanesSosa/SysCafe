-- Migración 002: guarda cuándo entró cada caso al comité y a soporte.
--  * fecha_entrada_comite: el aging de la cola del comité cuenta desde aquí, no desde la creación del caso.
--  * fecha_entrada_soporte: permite medir cuánto tardó soporte en cerrar (base de la vía rápida con casos reales).
ALTER TABLE caso ADD COLUMN fecha_entrada_comite TEXT;
ALTER TABLE caso ADD COLUMN fecha_entrada_soporte TEXT;

-- Casos que ya existían: se reconstruyen desde el historial de movimientos.
UPDATE caso SET fecha_entrada_comite = (
  SELECT MAX(m.fecha) FROM movimiento m WHERE m.caso_id = caso.id AND m.area_destino = 'comite'
)
WHERE EXISTS (SELECT 1 FROM movimiento m WHERE m.caso_id = caso.id AND m.area_destino = 'comite');
UPDATE caso SET fecha_entrada_soporte = (
  SELECT MAX(m.fecha) FROM movimiento m WHERE m.caso_id = caso.id AND m.area_destino = 'soporte'
)
WHERE EXISTS (SELECT 1 FROM movimiento m WHERE m.caso_id = caso.id AND m.area_destino = 'soporte');
-- Solo se tocan los casos que de verdad pasaron por ese centro; el resto queda en NULL, igual que antes.
