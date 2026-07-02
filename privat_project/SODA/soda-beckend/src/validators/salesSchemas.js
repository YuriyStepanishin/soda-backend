import Joi from 'joi';

export const salesPeriodSchema = Joi.object({
  dateFrom: Joi.date().required(),

  dateTo: Joi.date().required(),
});
