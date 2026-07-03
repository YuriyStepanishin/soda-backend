export const notFoundHandler = (req, res) => {
  res.status(404).json({ message: 'Шлях не знайдено' });
};
