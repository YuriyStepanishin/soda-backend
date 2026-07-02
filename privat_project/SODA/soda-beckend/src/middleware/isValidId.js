export const isValidId = (req, res, next) => {
  const { salesId } = req.params;

  if (!Number.isInteger(Number(salesId))) {
    return res.status(400).json({
      success: false,
      message: 'Некоректний id',
    });
  }

  next();
};
