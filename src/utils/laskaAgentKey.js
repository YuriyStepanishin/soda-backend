// Route imports and historical photo reports may use a documented short name.
// Keep the exception explicit so that different agents with the same first and last names stay separate.
export function laskaAgentKey(column) {
  const name = `lower(btrim(${column}))`;
  return `(CASE ${name}
    WHEN 'войцехівський руслан' THEN 'войцехівський руслан володимирович'
    ELSE ${name}
  END)`;
}
