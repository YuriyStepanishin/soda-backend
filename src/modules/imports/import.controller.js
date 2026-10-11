export const createImportController = ({ runImport, successMessage }) =>
  async (req, res) => {
    try {
      const summary = await runImport();

      return res.json({
        success: true,
        message: successMessage,
        summary,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };