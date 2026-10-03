import {
  importAgents,
  importProducts,
} from '../services/laskaDictionaryService.js';

export const runAgentsImport = async (req, res) => {
  try {
    const imported = await importAgents();

    res.json({
      success: true,
      message: 'Довідник ТА імпортовано',
      imported,
    });
  } catch (error) {
    console.error('[LASKA AGENTS ERROR]', error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const runProductsImport = async (req, res) => {
  try {
    const imported = await importProducts();

    res.json({
      success: true,
      message: 'Довідник товарів імпортовано',
      imported,
    });
  } catch (error) {
    console.error('[LASKA PRODUCTS ERROR]', error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
