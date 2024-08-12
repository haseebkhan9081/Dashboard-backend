// api/index.js
import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";

dotenv.config();

const client = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  password: process.env.REDIS_PASSWORD
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

client.connect().then(() => {
  console.log('Connected to Redis');
});
const CACHE_EXPIRATION_SECONDS = 10800; // 3 hours
const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.SERVER_URL, // Allow requests from this origin
}));
app.use(bodyParser.json());

// Initialize auth for Google Sheets
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure new lines are preserved
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
});

// Initialize Google Drive API
const drive = google.drive({ version: 'v3', auth: serviceAccountAuth });

 
function isSheetNameValid(sheetTitle) {
  // Clean up the sheet title by removing extra spaces and ensuring only one space between month and year
  const cleanedTitle = sheetTitle.trim().replace(/\s+/g, ' ');
  
  // Define a regular expression to match the format "monthname year" with exactly one space
  const sheetNamePattern = /^[A-Za-z]+\s\d{4}$/;
  
  // Check if the cleaned sheet name matches the pattern
  return sheetNamePattern.test(cleanedTitle);
}
// Route to serve dummy HTML at the root
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to the API</title>
    </head>
    <body>
      <h1>Welcome to the API Server</h1>
      <p>This is a dummy HTML page served at the root endpoint.</p>
    </body>
    </html>
  `);
});

// Endpoint to fetch all spreadsheet names
app.get('/api/sheets', async (req, res) => {
  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
    });

    const files = response.data.files;
    const sheetNames = files.map(file => ({
      value: file.id,
      label: file.name,
    }));
    res.json(sheetNames);
  } catch (error) {
    console.error('Error accessing Google Drive:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to fetch worksheet titles from a spreadsheet
app.get('/api/sheet/worksheets', async (req, res) => {
  const { sheetId } = req.query;

  if (!sheetId) {
    return res.status(400).json({ error: 'Sheet ID is required' });
  }

  try {
    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    
    // Load document properties and worksheets
    await doc.loadInfo();

    // Get the list of sheet titles
    const sheetTitles = doc.sheetsByIndex.map(sheet => ({
      label: sheet.title,
      value: sheet.sheetId,
    }));

    res.json(sheetTitles);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Utility function to validate dates
const isValidDate = (dateStr) => {
  const date = new Date(dateStr);
  return !isNaN(date);
};

// Endpoint to fetch data from a specific worksheet
app.get('/api/sheet/worksheet/data', async (req, res) => {
  const { sheetId, worksheetId } = req.query;

  if (!sheetId || !worksheetId) {
    return res.status(400).json({ error: 'Sheet ID and Worksheet ID are required' });
  }

  try {
    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    
    // Load document properties and worksheets
    await doc.loadInfo();

    const sheet = doc.sheetsById[worksheetId];

    if (!sheet) {
      return res.status(404).json({ error: 'Worksheet not found' });
    }

    // Fetch rows from the sheet
    const rows = await sheet.getRows();

    // Extract headers from the first row
    const headers = sheet.headerValues;

    // Convert rows to JSON
    const data = rows.map(row => {
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = row._rawData[index];
      });
      return rowData;
    });

    res.json(data);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

 

app.get('/api/analytics/Studentsvsboxes', async (req, res) => {
  const { attendanceSheet, quotationSheet, attendanceWorkSheet, quotationWorkSheet } = req.query;

  if (!attendanceSheet || !quotationSheet || !attendanceWorkSheet || !quotationWorkSheet) {
    return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
  }

  const cacheKey = `analytics:${attendanceSheet}:${quotationSheet}:${attendanceWorkSheet}:${quotationWorkSheet}`;

  try {
    // Check Redis cache first
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Serving data from cache');
      return res.json(JSON.parse(cachedData));
    }

    const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
    await attendanceDoc.loadInfo();
    const cleanTitle = (title) => {
      return title.trim().replace(/\s+/g, ' ');
    };
    const quotationWorkShet = cleanTitle(quotationWorkSheet);
    const attendanceWorkShet = cleanTitle(attendanceWorkSheet);
    const attendanceWorkSheetLower = attendanceWorkShet.toLowerCase();
    const attendanceSheetDoc = attendanceDoc.sheetsByTitle[Object.keys(attendanceDoc.sheetsByTitle).find(title => title.toLowerCase() === attendanceWorkSheetLower)];
    if (!attendanceSheetDoc) {
      return res.status(404).json({ error: 'Attendance worksheet not found' });
    }
    const attendanceRows = await attendanceSheetDoc.getRows();

    const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
    await quotationDoc.loadInfo();
    
    const quotationWorkSheetLower = quotationWorkShet.toLowerCase();
    const quotationSheetDoc = quotationDoc.sheetsByTitle[Object.keys(quotationDoc.sheetsByTitle).find(title => title.toLowerCase() === quotationWorkSheetLower)];
    if (!quotationSheetDoc) {
      return res.status(404).json({ error: 'Quotation worksheet not found' });
    }
    const quotationRows = await quotationSheetDoc.getRows();

    const extractData = (sheet, rows) => {
      const headers = sheet.headerValues;
      return rows.map(row => {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = row._rawData[index] || ''; // Default to empty string if undefined
        });
        return rowData;
      });
    };

    const attendanceData = extractData(attendanceSheetDoc, attendanceRows);
    const quotationData = extractData(quotationSheetDoc, quotationRows);

    const attendanceCountByDate = attendanceData.reduce((acc, attendance) => {
      const date = attendance.Date;
      const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
      if (isValid(parsedDate) && attendance.Time && attendance.Time.length > 0) {
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date]++;
      }
      return acc;
    }, {});
console.log("by date : ",attendanceCountByDate );
    const cleanedQuotationData = quotationData
      .filter(quotation => {
        const date = quotation.Date;
        const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
        return isValid(parsedDate) && !date.includes('TOTAL') && !date.includes('Sunday Excluded');
      })
      .map(quotation => {
        const date = quotation.Date;
        const noOfBoxes = quotation['No. Of Boxes'];
        
        return {
          Date: date,
          NoOfBoxes: noOfBoxes ? parseFloat(noOfBoxes.replace(/,/g, '')) || 0 : 0,
          NoOfPresents: attendanceCountByDate[date] || 0
        };
      });

    const resultData = cleanedQuotationData
      .filter(quotation => quotation.NoOfBoxes > 0 && quotation.NoOfPresents > 0)
      .map(quotation => ({
        Date: quotation.Date,
        NoOfBoxes: quotation.NoOfBoxes,
        NoOfPresents: quotation.NoOfPresents
      }));

    // Cache the result data in Redis
    await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(resultData));

    res.json(resultData);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





app.get('/api/analytics/expenses', async (req, res) => {
  const { quotationSheet, expensesWorkSheet, month} = req.query;
console.log("data for request",quotationSheet,expensesWorkSheet,month)
  if (!quotationSheet || !expensesWorkSheet || !month) {
    return res.status(400).json({ error: 'All sheet and worksheet IDs and month are required' });
  }

  const cleanMonthName = (month) => {
    return month.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  const cleanMonth = cleanMonthName(month);
  const cacheKey = `expenses:${quotationSheet}:${expensesWorkSheet}:${cleanMonth}`;

  try {
    // Check Redis cache first
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Serving data from cache');
      return res.json(JSON.parse(cachedData));
    }

    // Load the quotation sheet
    const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
    await quotationDoc.loadInfo();

    // Load the expenses sheet
    const expensesSheetDoc = quotationDoc.sheetsById[expensesWorkSheet];
    if (!expensesSheetDoc) {
      return res.status(404).json({ error: 'Expenses worksheet not found' });
    }
    const expensesRows = await expensesSheetDoc.getRows();

    // Find the column indices for the specified month
    const monthColumnStartIndex = expensesSheetDoc.headerValues.findIndex(header => cleanMonthName(header) === cleanMonth);
    if (monthColumnStartIndex === -1) {
      return res.status(404).json({ error: `Month ${month} not found in the worksheet` });
    }

    // Adjust the end column index for the merged header
    const monthColumnEndIndex = monthColumnStartIndex + 1; // Assuming next column contains salary data

    console.log('Month Column Start Index:', monthColumnStartIndex);
    console.log('Month Column End Index:', monthColumnEndIndex);

    // Initialize sums for the month
    let salarySum = 0;
    let otherExpensesSum = 0;

    // Process the data to separate salaries from other expenses
    expensesRows.forEach(row => {
      // Use only the relevant columns
      const name = row._rawData[monthColumnStartIndex]?.trim().toLowerCase();
      const salary = row._rawData[monthColumnEndIndex]?.trim();

      // Log the values for debugging
      console.log('Row Data:', row._rawData);
      console.log('Name Column Value:', name);
      console.log('Salary Column Value:', salary);

      // Exclude rows where the name is "total" or salary is invalid
      if (!name || name === 'total' || !salary || isNaN(parseFloat(salary.replace(/,/g, '').trim()))) {
        console.log('Skipping row due to invalid data:', JSON.stringify(row._rawData));
        return;
      }

      console.log('Processing row:', JSON.stringify(row._rawData));
      console.log('Name:', name);
      console.log('Salary:', salary);

      const parsedSalary = parseFloat(salary.replace(/,/g, '').trim());

      if (name.includes('cleaning') || name.includes('wifi') || name.includes('ice')) {
        otherExpensesSum += parsedSalary;
      } else {
        salarySum += parsedSalary;
      }
    });

    console.log('Salary Sum:', salarySum);
    console.log('Other Expenses Sum:', otherExpensesSum);
    const capitalizeFirstLetter = (string) => {
      return string.charAt(0).toUpperCase() + string.slice(1);
    };
    
    // Grouped data structure
    const resultData = {
      [capitalizeFirstLetter(cleanMonth)]: {
        salarySum,
        otherExpensesSum
      }
    };
    

    // Cache the result data in Redis
    await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(resultData));

    // Return the results
    res.json(resultData);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});












 

app.get('/api/analytics/mealCost', async (req, res) => {
  const { quotationSheet } = req.query;

  if (!quotationSheet) {
    return res.status(400).json({ error: 'Sheet ID is required' });
  }

  const cacheKey = `mealCost:${quotationSheet}`;
   
  try {
    // Check Redis cache first
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Serving data from cache');
      return res.json(JSON.parse(cachedData));
    }

    // Load the quotation sheet
    const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
    await quotationDoc.loadInfo();

    const sheetResults = {};

    // Iterate over all sheets
    for (const sheetId in quotationDoc.sheetsById) {
      const sheet = quotationDoc.sheetsById[sheetId];

      try {
        await sheet.loadHeaderRow();
        const headers = sheet.headerValues.map(header => header.trim());

        // Check if the sheet contains the "Cost for 200 Meals" column
        if (headers.includes('Cost for 200 Meals')&&isSheetNameValid(sheet.title)){
          const rows = await sheet.getRows();

          // Extract data and perform calculations
          const extractData = (sheet, rows) => {
            return rows.map(row => {
              const rowData = {};
              headers.forEach((header, index) => {
                rowData[header] = row._rawData[index]?.trim() || '';
              });
              return rowData;
            });
          };

          const sheetData = extractData(sheet, rows);

          // Filter out rows with invalid or empty dates and skip the last row (total)
          const validData = sheetData.filter((row, index, array) => {
            const isLastRow = index === array.length - 1;
            const date = row.Date;
            const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
            const hasValidDate = isValid(parsedDate) && date.trim() !== '' && date !== 'TOTAL (PKR)' && date !== '*Sunday Excluded';
            return hasValidDate && !isLastRow;
          });

          // Sum up the "Cost for 200 Meals"
          const totalCostFor200Meals = validData.reduce((sum, row) => {
            const cost = parseFloat(row['Cost for 200 Meals'].replace(/,/g, ''));
            return sum + (isNaN(cost) ? 0 : cost);
          }, 0);

          // Store the result with the sheet name
          sheetResults[sheet.title] = totalCostFor200Meals;
        }
      } catch (error) {
        console.warn(`Error processing sheet ${sheet.title}:`, error.message);
        // You may want to handle individual sheet errors differently, e.g., continue processing other sheets
      }
    }
 
    // Cache the result
    await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(sheetResults));

    // Return the result
    console.log(sheetResults);
    res.json(sheetResults);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


  
  


 

  
app.get('/api/analytics/AverageStudentVsBoxes', async (req, res) => {
  const { quotationSheet, attendanceSheet } = req.query;

  if (!quotationSheet || !attendanceSheet) {
    return res.status(400).json({ error: 'Sheet IDs for both quotation and attendance are required' });
  }

  const cacheKey = `AverageStudentVsBoxes:${quotationSheet}:${attendanceSheet}`;

  try {
    // Check if result is cached
    const cachedResult = await client.get(cacheKey);
    if (cachedResult) {
      console.log("Serving data from cache");
      return res.json(JSON.parse(cachedResult));
    }
    function capitalizeFirstLetter(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
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
    console.log("Loading Google Sheets...");

    // Load the main sheets
    const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
    await quotationDoc.loadInfo();
    const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
    await attendanceDoc.loadInfo();

    console.log("Sheets loaded successfully");

    // Clean and sort subsheet titles
    const cleanTitle = (title) => {
      return title.trim().replace(/\s+/g, ' ');
    };

    const extractMonthAndYear = (title) => {
      const [month, year] = title.split(' ');
      return { month: month.toLowerCase(), year: parseInt(year, 10) };
    };

    // Filter valid quotation sheets
    const filterValidQuotationSheets = async (doc) => {
      const validSheets = [];
      for (const sheet of doc.sheetsByIndex) {
        try {
          await sheet.loadHeaderRow();
          if (sheet.headerValues.includes('No. Of Boxes')&&isSheetNameValid(sheet.title)) {
            validSheets.push(cleanTitle(sheet.title));
          }
        } catch (err) {
          console.warn(`Skipping invalid sheet: ${sheet.title}`);
        }
      }
      return validSheets;
    };

    console.log("Filtering valid quotation sheets...");
    const quotationTitles = await filterValidQuotationSheets(quotationDoc);

    console.log("Quotation titles:", quotationTitles);

    // Process quotation sheets
    const processQuotationSheets = async (titles) => {
      const sortedSheetTitles = titles.sort((a, b) => {
        const dateA = new Date(`${extractMonthAndYear(a).month} 1, ${extractMonthAndYear(a).year}`);
        const dateB = new Date(`${extractMonthAndYear(b).month} 1, ${extractMonthAndYear(b).year}`);
        return dateB - dateA;
      });

      console.log("Sorted sheet titles:", sortedSheetTitles);

      const latestThreeMonths = sortedSheetTitles.slice(0, 3);

      console.log("Latest three months:", latestThreeMonths);

      const results = {};
      for (const sheetTitle of latestThreeMonths) {
        console.log(`Fetching data for quotation sheet: ${sheetTitle}`);
        const sheetDoc = quotationDoc.sheetsByIndex.find(sheet => cleanTitle(sheet.title).toLowerCase() === sheetTitle.toLowerCase());

        if (!sheetDoc) {
          console.warn(`Quotation sheet not found: ${sheetTitle}`);
          continue;
        }

        const rows = await sheetDoc.getRows();
               const extracteData=   await  extractData(sheetDoc,rows);
        console.log("extractData  : ",extracteData);
        const data = extracteData.map(row => ({
          Date: row.Date,
          'No. Of Boxes': row['No. Of Boxes'],
        }));

        console.log(`Data for quotation sheet ${sheetTitle}:`, data);
        const filteredData = data.filter(row => {
          // Parse and validate the date
          const parsedDate = parse(row.Date, 'MM/dd/yyyy', new Date());
          if (!isValid(parsedDate)) {
            return false; // Skip the row if the date is invalid
          }
        
          // Check if 'No. Of Boxes' has a valid number
          const noOfBoxesStr = row['No. Of Boxes']?.replace(/,/g, '').trim();
          const noOfBoxes = parseFloat(noOfBoxesStr);
          
          // Ensure noOfBoxes is a number and not zero
          return !isNaN(noOfBoxes) && noOfBoxes !== 0;
        });
        console.log("filteredData ",filteredData.slice(0,3));
        // Calculate the sum separately
const totalSum = filteredData.reduce((sum, row) => {
  const noOfBoxesStr = row['No. Of Boxes']?.replace(/,/g, '').trim();
  const noOfBoxes = parseFloat(noOfBoxesStr);
  return sum + (isNaN(noOfBoxes) ? 0 : noOfBoxes);
}, 0);

console.log('Total Sum:', totalSum);

// Calculate the average separately
const averageBoxes = filteredData.length > 0 ? totalSum / filteredData.length : 0;

console.log('Average Boxes:', averageBoxes);

        results[`${capitalizeFirstLetter(extractMonthAndYear(sheetTitle).month)} ${extractMonthAndYear(sheetTitle).year}`] = {
          averageBoxes: averageBoxes || 0,
          averageStudentsPresent: 0, // Placeholder for attendance data
        };

        console.log(`Results for ${sheetTitle}:`, results[`${capitalizeFirstLetter(extractMonthAndYear(sheetTitle).month)} ${extractMonthAndYear(sheetTitle).year}`]);
      }

      return results;
    };

    const quotationResults = await processQuotationSheets(quotationTitles);

    // Process attendance sheets
    const processAttendanceSheets = async (doc, titles) => {
      const results = {};

      for (const sheetTitle of titles) {
        console.log(`Fetching data for attendance sheet: ${sheetTitle}`);
        const sheetDoc = doc.sheetsByIndex.find(sheet => cleanTitle(sheet.title).toLowerCase() === sheetTitle.toLowerCase());

        if (!sheetDoc) {
          console.warn(`Attendance sheet not found: ${sheetTitle}`);
          continue;
        }

        const rows = await sheetDoc.getRows();
        const extracteData=   await  extractData(sheetDoc,rows);
        const data = extracteData.map(row => ({
          Date: row.Date,
          Time: row.Time,
          Name:row.Name,
          Department:row.Department
        }));

        console.log(`Data for attendance sheet ${sheetTitle}:`, data.slice(0,3));

        const countStudentsPresent = (data) => {
          return data.reduce((acc, row) => {
            const date = row.Date;
            if (row.Time && row.Time.length > 0) {
              if (!acc[date]) {
                acc[date] = 0;
              }
              acc[date]++;
            }
            return acc;
          }, {});
        };

        const attendanceCountByDate = countStudentsPresent(data);
        console.log("students present by date ",attendanceCountByDate);

        const calculateAverageAttendance = (attendanceCountByDate) => {
          // Log the initial attendance count by date
          console.log("Attendance Count By Date:", attendanceCountByDate);
        
          // Reduce to calculate total attendance and number of dates with positive attendance
          const { totalPresentStudents, daysWithAttendance } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
            console.log(`Processing Date: ${date}, Count: ${count}`);
            
            if (count > 0) {  // Only include dates where there is positive attendance
              acc.totalPresentStudents += count;
              acc.daysWithAttendance += 1;
            }
        
            // Log the accumulated values after each iteration
            console.log(`Accumulated Total Present Students: ${acc.totalPresentStudents}`);
            console.log(`Accumulated Days With Attendance: ${acc.daysWithAttendance}`);
            
            return acc;
          }, { totalPresentStudents: 0, daysWithAttendance: 0 });
        
          // Calculate the average attendance
          const averageAttendance = daysWithAttendance > 0 ? totalPresentStudents / daysWithAttendance : 0;
        
          // Log the final calculated average
          console.log("Final Average Attendance:", averageAttendance);
        
          return averageAttendance;
        };
        

        const averageAttendance = calculateAverageAttendance(attendanceCountByDate);

        const { month, year } = extractMonthAndYear(sheetTitle);
        const key = `${capitalizeFirstLetter(month)} ${year}`;

        if (results[key]) {
          results[key].averageStudentsPresent = averageAttendance;
        } else {
          results[key] = {
            averageBoxes: 0, // Placeholder for quotation data
            averageStudentsPresent: averageAttendance || 0,
          };
        }

        console.log(`Results for ${sheetTitle}:`, results[key]);
      }

      return results;
    };

    const attendanceTitles = attendanceDoc.sheetsByIndex.map(sheet => cleanTitle(sheet.title));
    const attendanceResults = await processAttendanceSheets(attendanceDoc, attendanceTitles);
    console.log("qu result", quotationResults);
console.log("att result", attendanceResults);

// Initialize finalResults with an empty object
const finalResults = {};

// Combine data from both results
Object.keys(quotationResults).forEach(month => {
  if (attendanceResults[month]) {
    // If month exists in both results, combine them
    finalResults[month] = {
      averageBoxes: quotationResults[month].averageBoxes,
      averageStudentsPresent: attendanceResults[month].averageStudentsPresent
    };
  } else {
    // If month exists only in quotationResults
    finalResults[month] = {
      averageBoxes: quotationResults[month].averageBoxes,
      averageStudentsPresent: 0 // Default value or adjust as needed
    };
  }
});

// Add months that are only in attendanceResults
Object.keys(attendanceResults).forEach(month => {
  if (!finalResults[month]) {
    finalResults[month] = {
      averageBoxes: 0, // Default value or adjust as needed
      averageStudentsPresent: attendanceResults[month].averageStudentsPresent
    };
  }
});

console.log("Returning results:", finalResults);

    
    // Cache the result
    await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(finalResults));

    console.log("Returning results:", finalResults);

    // Return the result
    res.json(finalResults);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});







  
  
  

  

  app.get('/api/analytics/studentAveragePerClass', async (req, res) => {
    const { attendanceSheet, attendanceWorkSheet } = req.query;
  
    if (!attendanceSheet || !attendanceWorkSheet) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }
  
    const cacheKey = `studentAveragePerClass:${attendanceSheet}:${attendanceWorkSheet}`;
  
    try {
      // Check if result is cached
      const cachedResult = await client.get(cacheKey);
        if (cachedResult) {
          console.log('Serving data from cache');
          return res.json(JSON.parse(cachedResult));
        }
  
      const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
      await attendanceDoc.loadInfo();
  
      // Function to clean the title by removing leading, trailing, and extra spaces
      const cleanTitle = (title) => {
        return title.trim().replace(/\s+/g, ' ');
      };
  
      // Clean and convert the attendanceWorkSheet title to lowercase
      const attendanceWorkSheetCleaned = cleanTitle(attendanceWorkSheet).toLowerCase();
  
      // Find the worksheet by title in a case-insensitive manner
      const attendanceSheetDocCurrent = attendanceDoc.sheetsByIndex.find(sheet => 
        sheet.title.toLowerCase() === attendanceWorkSheetCleaned
      );
  
      if (!attendanceSheetDocCurrent) {
        return res.status(404).json({ error: 'Current attendance worksheet not found' });
      }
  
      const attendanceRowsCurrent = await attendanceSheetDocCurrent.getRows();
  
      const extractData = (sheet, rows) => {
        const headers = sheet.headerValues.map(header => header.trim());
        return rows.map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = row._rawData[index]?.trim() || '';
          });
          return rowData;
        });
      };
  
      const currentAttendanceData = extractData(attendanceSheetDocCurrent, attendanceRowsCurrent);
  
      const groupedData = currentAttendanceData.reduce((acc, row) => {
        if (row.Time && row.Time.length > 0) {
          if (!acc[row.Department]) {
            acc[row.Department] = {};
          }
          if (!acc[row.Department][row.Date]) {
            acc[row.Department][row.Date] = 0;
          }
          acc[row.Department][row.Date] += 1;
        }
        return acc;
      }, {});
  
      const calculateAverage = (data) => {
        const result = {};
        for (const department in data) {
          const dates = Object.keys(data[department]).sort((a, b) => new Date(b) - new Date(a)).slice(0, 7);
          const total = dates.reduce((sum, date) => sum + data[department][date], 0);
          const average = total / dates.length;
          result[department] = average;
        }
        return result;
      };
  
      const averages = calculateAverage(groupedData);
  
      // Convert to an array and sort by department name
      const response = Object.entries(averages)
        .map(([department, average]) => ({
          department,
          average: average.toFixed(2),
        }))
        .sort((a, b) => a.department.localeCompare(b.department)); // Sort alphabetically by department name
  
      // Cache the result
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(response));
  
      // Return the result
      res.json(response);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  
  
 

 app.get('/api/analytics/totalMealsServed', async (req, res) => {
    const { quotationSheet } = req.query;
  
    if (!quotationSheet) {
      return res.status(400).json({ error: 'Sheet ID is required' });
    }
  
    const cacheKey = `totalMealsServed:${quotationSheet}`;
  
    try {
      // Check Redis cache first
      const cachedData = await client.get(cacheKey);
      if (cachedData) {
        console.log('Serving data from cache');
        return res.json(JSON.parse(cachedData));
      }
  
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
  
      const sheetResults = {};
      let latestDate = null;
  
      // Iterate over all sheets
      for (const sheetId in quotationDoc.sheetsById) {
        const sheet = quotationDoc.sheetsById[sheetId];
  
        try {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues.map(header => header.trim());
  
          // Check if the sheet contains the "No. Of Boxes" column
          
          if (isSheetNameValid(sheet.title)&&headers.includes('No. Of Boxes')) {
            const rows = await sheet.getRows();
  
            // Extract data and perform calculations
            const extractData = (sheet, rows) => {
              return rows.map(row => {
                const rowData = {};
                headers.forEach((header, index) => {
                  rowData[header] = row._rawData[index]?.trim() || '';
                });
                return rowData;
              });
            };
  
            const sheetData = extractData(sheet, rows);
  
            // Filter out rows with invalid or empty dates and skip the last row (total)
            const validData = sheetData.filter((row, index, array) => {
              const isLastRow = index === array.length - 1;
              const date = row.Date;
              const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
              const hasValidDate = isValid(parsedDate) && date.trim() !== '' && date !== 'TOTAL (PKR)' && date !== '*Sunday Excluded';
              const hasValidBoxes = row['No. Of Boxes'].trim() !== '';
              return hasValidDate && hasValidBoxes && !isLastRow;
            });
  
            // console.log(`Valid data for sheet ${sheet.title}:`, validData);
  
            // Find the latest date
            validData.forEach(row => {
              const date = row.Date;
              const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
              // console.log(`Parsed date for row ${JSON.stringify(row)}:`, parsedDate);
              if (isValid(parsedDate) && (!latestDate || parsedDate > latestDate)) {
                latestDate = parsedDate;
                // console.log(`Updated latest date:`, latestDate);
              }
            });
  
            // Sum up the "No. Of Boxes"
            const totalCostMeals = validData.reduce((sum, row) => {
              const cost = parseFloat(row['No. Of Boxes'].replace(/,/g, ''));
              return sum + (isNaN(cost) ? 0 : cost);
            }, 0);
  
            // Store the result with the sheet name
            sheetResults[sheet.title] = totalCostMeals;
          }else{
            console.log('The sheet is not valid:', sheet.title);
          }
        } catch (error) {
          console.warn(`Error processing sheet ${sheet.title}:`, error.message);
          // You may want to handle individual sheet errors differently, e.g., continue processing other sheets
        }
      }
  
      // Calculate the total sum of "No. Of Boxes" across all sheets
      const totalMealsServed = Object.values(sheetResults).reduce((sum, value) => sum + value, 0);
  
      // Cache the result
      const formattedLatestDate = latestDate ? format(latestDate, 'MMMM/dd/yyyy', { locale: enUS }) : null;
      
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify({ totalMealsServed, formattedLatestDate }));
      // Return the result
      console.log({ totalMealsServed, formattedLatestDate });
      res.json({ totalMealsServed, formattedLatestDate });
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  


  
  app.get('/api/analytics/mealsServedLast7days', async (req, res) => {
    const { quotationSheet, quotationWorkSheet } = req.query;
  
    if (!quotationSheet || !quotationWorkSheet) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }
  
    const cacheKey = `mealCostStudentAverage:${quotationSheet}:${quotationWorkSheet}`;
  
    try {
      // Check if result is cached
      const cachedResult = await client.get(cacheKey);
      if (cachedResult) {
        console.log("Serving data from cache");
        return res.json(JSON.parse(cachedResult));
      }
  
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
  
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ].map(month => month.toLowerCase());
  
      const cleanTitle = (title) => {
        return title.trim().replace(/\s+/g, ' ').toLowerCase();
      };
  
      const getWorksheetData = async (worksheetDoc) => {
        const rows = await worksheetDoc.getRows();
        const headers = worksheetDoc.headerValues.map(header => header.trim());
        return rows.map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = row._rawData[index]?.trim() || '';
          });
          return rowData;
        });
      };
  
      const filterValidData = (data) => {
        return data.filter((row) => {
          const date = row.Date;
          const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
          const hasValidDate = isValid(parsedDate) && date.trim() !== '' && date !== 'TOTAL (PKR)' && date !== '*Sunday Excluded';
          const hasValidBoxes = row['No. Of Boxes'] && parseFloat(row['No. Of Boxes'].replace(/,/g, '')) !== 0;
          return hasValidDate && hasValidBoxes;
        });
      };
  
      const collectLast7DaysData = async (doc, initialWorksheetDoc, months) => {
        let data = [];
        let worksheetDoc = initialWorksheetDoc;
        let currentYear = new Date().getFullYear();
  
        while (data.length < 7) {
          const currentData = await getWorksheetData(worksheetDoc);
          const validData = filterValidData(currentData);
          data = [...validData.slice(-7), ...data];
  
          if (data.length >= 7) break;
  
          // Move to the previous month
          let monthIndex = months.indexOf(cleanTitle(worksheetDoc.title).split(' ')[0]);
          if (monthIndex === -1) break;
  
          if (monthIndex === 0) {
            monthIndex = 11;
            currentYear--;
          } else {
            monthIndex--;
          }
  
          const previousWorkSheetName = `${months[monthIndex]} ${currentYear}`;
          worksheetDoc = doc.sheetsByIndex.find(sheet => cleanTitle(sheet.title) === cleanTitle(previousWorkSheetName));
  
          if (!worksheetDoc) break;
        }
  
        return data.slice(-7);
      };
  
      // Clean and convert the quotationWorkSheet title to lowercase
      const cleanedQuotationWorkSheet = cleanTitle(quotationWorkSheet);
  
      // Find the current worksheet by title in a case-insensitive manner
      const currentExpensesSheetDoc = quotationDoc.sheetsByIndex.find(sheet => cleanTitle(sheet.title) === cleanedQuotationWorkSheet);
      if (!currentExpensesSheetDoc) {
        return res.status(404).json({ error: 'Current month expenses worksheet not found' });
      }
  
      const last7DaysData = await collectLast7DaysData(quotationDoc, currentExpensesSheetDoc, months);
  
      const result = {
        last7DaysMeals: last7DaysData.map(row => ({
          date: row.Date,
          mealName: row['Meal Name'],
          boxes: row['No. Of Boxes']
        })).reverse(), // Reverse the array here
        dataAvailable: last7DaysData.length === 7
      };
      
      // Cache the result
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(result));
      
      // Return the result
      res.json(result);
      
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  

  app.get('/api/analytics/averageAttendanceUntilNow', async (req, res) => {
    const { attendanceSheet } = req.query;
  
    if (!attendanceSheet) {
      return res.status(400).json({ error: 'Attendance sheet ID is required' });
    }
  
    const cacheKey = `averageAttendanceUntilNow:${attendanceSheet}`;
  
    try {
      // Check if result is cached
      const cachedResult = await client.get(cacheKey);
      if (cachedResult) {
        console.log("Serving data from cache");
        return res.json(JSON.parse(cachedResult));
      }
  
      // Load the attendance sheet
      const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
      await attendanceDoc.loadInfo();
  
      const allAttendanceSheets = attendanceDoc.sheetsByIndex;
  
      const extractData = (sheet, rows) => {
        const headers = sheet.headerValues.map(header => header.trim());
        return rows.map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = row._rawData[index]?.trim() || '';
          });
          return rowData;
        });
      };
  
      const countStudentsPresent = (data) => {
        return data.reduce((acc, attendance) => {
          const date = attendance.Date;
          const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
          if (attendance.Time && attendance.Time.length > 0 && isValid(parsedDate)) {
            const formattedDate = parsedDate.toISOString().split('T')[0]; // Normalize date to YYYY-MM-DD
            if (!acc[formattedDate]) {
              acc[formattedDate] = 0;
            }
            acc[formattedDate]++;
          }
          return acc;
        }, {});
      };
  
      const calculateAverageAttendance = (attendanceCountByDate) => {
        const { totalPresentStudents, daysWithAttendance } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
          if (count > 0) {
            acc.totalPresentStudents += count;
            acc.daysWithAttendance += 1;
          }
          return acc;
        }, { totalPresentStudents: 0, daysWithAttendance: 0 });
  
        return daysWithAttendance > 0 ? totalPresentStudents / daysWithAttendance : 0;
      };
  
      let totalPresentStudents = 0;
      let totalDaysWithAttendance = 0;
  
      for (const sheet of allAttendanceSheets) {
        const attendanceRows = await sheet.getRows();
        const attendanceData = extractData(sheet, attendanceRows);
        const attendanceCountByDate = countStudentsPresent(attendanceData);
  console.log("count present students ",attendanceCountByDate);
        const averageAttendanceForSheet = calculateAverageAttendance(attendanceCountByDate);
        totalPresentStudents += Object.values(attendanceCountByDate).reduce((sum, count) => sum + count, 0);
        totalDaysWithAttendance += Object.keys(attendanceCountByDate).length;
      }
  
      const averageAttendanceUntilNow = totalDaysWithAttendance > 0 ? totalPresentStudents / totalDaysWithAttendance : 0;
  
      const result = {
        averageAttendanceUntilNow,
        totalPresentStudents,
        totalDaysWithAttendance
      };
  
      // Cache the result
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(result));
  
      // Return the result
      res.json(result);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  app.get('/api/analytics/quotationperMeal', async (req, res) => {
    const { quotationSheet, quotationWorkSheet } = req.query;

    if (!quotationSheet || !quotationWorkSheet) {
        return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }

    const cacheKey = `quotationperMeal:${quotationSheet}:${quotationWorkSheet}`;

    try {
        // Check if result is cached
        const cachedResult = await client.get(cacheKey);
        if (cachedResult) {
            console.log("Serving data from cache");
            return res.json(JSON.parse(cachedResult));
        }

        // Load the quotation sheet
        const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
        await quotationDoc.loadInfo();

        // Clean the worksheet title
        const cleanTitle = (title) => {
            return title.trim().replace(/\s+/g, ' ').toLowerCase();
        };

        // Get all worksheet titles
        const worksheetTitles = quotationDoc.sheetsByIndex.map(sheet => sheet.title);
        
        // Find the matching worksheet by comparing cleaned titles (case insensitive)
        const targetWorksheet = worksheetTitles.find(title => cleanTitle(title) === cleanTitle(quotationWorkSheet));

        if (!targetWorksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        // Load the specific worksheet by title
        const worksheet = quotationDoc.sheetsByTitle[targetWorksheet];
        await worksheet.loadCells('D4:F'); // Load cells from D4 to the last F column

        const data = [];
        let rowIndex = 5; // Start from row 4

        // Iterate through rows starting from D4
        while (true) {
            const mealPlanCell = worksheet.getCell(rowIndex, 3); // Column D (index 3)
            const quotationsCell = worksheet.getCell(rowIndex, 4); // Column E (index 4)
            const costCell = worksheet.getCell(rowIndex, 5); // Column F (index 5)

            // Break the loop if there's no more data in the Meal Plan column
            if (!mealPlanCell.value) break;

            // Ensure cell values are strings and trim them
            const mealPlan = (mealPlanCell.value || '').toString().trim();
            const quotations = (quotationsCell.value || '').toString().trim();
            const costFor200Meals = (costCell.value || '').toString().trim();

            data.push({
                mealPlan,
                quotations,
                costFor200Meals
            });

            rowIndex++;
        }

        // Cache the result
        await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(data));

        // Return the result
        res.json(data);

    } catch (error) {
        console.error('Error accessing Google Sheets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



  
  
export default app;
