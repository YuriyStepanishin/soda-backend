export const getPagination = (query = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);

  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || 50, 1),
    500,
  );

  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
};
