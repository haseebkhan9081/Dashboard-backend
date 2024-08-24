const extractData = async(sheet, rows) => {
    await sheet.loadHeaderRow();
      const headers = sheet.headerValues.map(header => header.trim());
    return rows.map(row => {
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = row._rawData[index]?.trim() || '';
      });
      return rowData;
    });
  };

export default extractData;