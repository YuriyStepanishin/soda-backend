import * as authService from '../services/authService.js';

export const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
