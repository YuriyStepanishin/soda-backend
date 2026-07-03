import { Joi } from 'celebrate';

export const createSaleSchema = Joi.object({
  sale_date: Joi.date().required(),

  tm: Joi.string().trim().required(),

  product_name: Joi.string().trim().required(),

  qty: Joi.number().positive().required(),

  amount: Joi.number().positive().required(),

  barcode: Joi.string().allow(null, ''),

  client_code: Joi.string().allow(null, ''),

  client_name: Joi.string().allow(null, ''),

  outlet_code: Joi.string().allow(null, ''),

  outlet_name: Joi.string().allow(null, ''),

  address: Joi.string().allow(null, ''),

  agent_name: Joi.string().allow(null, ''),

  supervisor_name: Joi.string().allow(null, ''),

  volume: Joi.string().allow(null, ''),

  outlet_type: Joi.string().allow(null, ''),

  alt_name: Joi.string().allow(null, ''),

  price_type: Joi.string().allow(null, ''),

  discount: Joi.string().allow(null, ''),

  weight: Joi.number().allow(null),

  price: Joi.number().allow(null),
});
