export const canViewVmd = role => ['admin', 'manager', 'supervisor'].includes(role);

export const vmdAggregate = (price, purchase, quantity) => `ROUND(COALESCE(SUM(CASE
  WHEN ${purchase} > 0 THEN (${price} - ${purchase}) * ${quantity}
  ELSE 0
END), 0)::numeric, 2) AS vmd`;
