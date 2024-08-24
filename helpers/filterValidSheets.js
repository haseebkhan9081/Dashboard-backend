import isSheetNameValid from "./isSheetNameValid.js";
const cleanTitle = (title) => {
    return title.trim().replace(/\s+/g, ' ');
  };
const filterValidSheets = async (doc) => {
    const validSheets = [];
    for (const sheet of doc.sheetsByIndex) {
      try {
        await sheet.loadHeaderRow();
        if (isSheetNameValid(sheet.title)) {
          validSheets.push(cleanTitle(sheet.title));
        }
      } catch (err) {
        console.warn(`Skipping invalid sheet: ${sheet.title}`);
      }
    }
    return validSheets;
  };


  export default filterValidSheets;