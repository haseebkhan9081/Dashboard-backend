export default function isSheetNameValid(sheetTitle) {
    // Clean up the sheet title by removing extra spaces and ensuring only one space between month and year
    const cleanedTitle = sheetTitle.trim().replace(/\s+/g, ' ');
    
    // Define a regular expression to match the format "monthname year" with exactly one space
    const sheetNamePattern = /^[A-Za-z]+\s\d{4}$/;
    
    // Check if the cleaned sheet name matches the pattern
    return sheetNamePattern.test(cleanedTitle);
  }