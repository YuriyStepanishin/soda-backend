import * as authService from '../services/authService.js';

// Приймає дані логіну, делегує перевірку сервісу та повертає токен з профілем.
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

// Змінює пароль поточного користувача (id беремо з req.user після authenticate).
export const changePassword = async (req, res, next) => {
  try {
    const result = await authService.changeUserPassword({
      userId: req.user.id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
