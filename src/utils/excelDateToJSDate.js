import XLSX from 'xlsx';

export const excelDateToJSDate = (value) => {
  if (!value) return null;

  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));

    return new Date(excelEpoch.getTime() + value * 86400000);
  }

  if (typeof value === 'string') {
    const parts = value.split('.');

    if (parts.length === 3) {
      const [day, month, year] = parts;

      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  return null;
};
