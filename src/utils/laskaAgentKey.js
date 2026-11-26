// Route imports and historical photo reports may use a documented short name.
// Keep each exception explicit so that different agents with the same first and last names stay separate.
export function laskaAgentKey(column) {
  const name = `lower(btrim(${column}))`;
  return `(CASE ${name}
    WHEN 'василюк віталій' THEN 'василюк віталій вікторович'
    WHEN 'горецька тетяна' THEN 'горецька тетяна петрівна'
    WHEN 'плейзор станіслав' THEN 'плейзор станіслав григорович'
    WHEN 'войцехівський руслан' THEN 'войцехівський руслан володимирович'
    ELSE ${name}
  END)`;
}
