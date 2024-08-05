// api/index.js
import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
 

dotenv.config();

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

// Endpoint to fetch analytics data
app.get('/api/analytics/Studentsvsboxes', async (req, res) => {
  const { attendanceSheet, quotationSheet, attendanceWorkSheet, quotationWorkSheet } = req.query;

  if (!attendanceSheet || !quotationSheet || !attendanceWorkSheet || !quotationWorkSheet) {
    return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
  }
  
  try {
    // Load the attendance sheet and worksheet
    const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
    await attendanceDoc.loadInfo();
    const attendanceSheetDoc = attendanceDoc.sheetsById[Number(attendanceWorkSheet)];
    if (!attendanceSheetDoc) {
      return res.status(404).json({ error: 'Attendance worksheet not found' });
    }
    const attendanceRows = await attendanceSheetDoc.getRows();

    // Load the quotation sheet and worksheet
    const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
    await quotationDoc.loadInfo();
    const quotationSheetDoc = quotationDoc.sheetsById[quotationWorkSheet];
    if (!quotationSheetDoc) {
      return res.status(404).json({ error: 'Quotation worksheet not found' });
    }
    const quotationRows = await quotationSheetDoc.getRows();

    // Extract headers and convert rows to JSON for all sheets
    const extractData = (sheet, rows) => {
      const headers = sheet.headerValues;
      return rows.map(row => {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = row._rawData[index];
        });
        return rowData;
      });
    };

    const attendanceData = extractData(attendanceSheetDoc, attendanceRows);
    const quotationData = extractData(quotationSheetDoc, quotationRows);
    console.log("Attendance Data in Studentsvsboxes ",attendanceData);

    const attendanceCountByDate = attendanceData.reduce((acc, attendance) => {
      const date = attendance.Date;
      if (attendance.Time && attendance.Time.length > 0) { // Consider only present employees
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date]++;
      }
      return acc;
    }, {});

    const cleanedQuotationData = quotationData
      .filter(quotation => quotation.Date && isValidDate(quotation.Date) && !quotation.Date.includes('TOTAL') && !quotation.Date.includes('Sunday Excluded'))
      .map(quotation => {
        const date = quotation.Date;
        return {
          Date: date,
          NoOfBoxes: parseFloat(quotation['No. Of Boxes'].replace(/,/g, '')) || 0,
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
    console.log("Attendance Data in Studentsvsboxes ",attendanceCountByDate);

    res.json(resultData);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/api/analytics/expenses', async (req, res) => {
    const { quotationSheet, expensesWorkSheet } = req.query;
  
    if (!quotationSheet || !expensesWorkSheet) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }
  
    try {
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
  
      // Load the expenses sheet
      const expensesSheetDoc = quotationDoc.sheetsById[expensesWorkSheet];
      if (!expensesSheetDoc) {
        return res.status(404).json({ error: 'Expenses worksheet not found' });
      }
      const expensesRows = await expensesSheetDoc.getRows();
  
      // Extract headers and convert rows to JSON for all sheets
      const extractData = (sheet, rows) => {
        const headers = sheet.headerValues;
        return rows.map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header.trim()] = row._rawData[index]?.trim() || '';
          });
          return rowData;
        });
      };
  
      const expensesData = extractData(expensesSheetDoc, expensesRows);
      expensesData.pop(); // Remove any unwanted last entry if necessary
  
      // Initialize sums
      let salarySum = 0;
      let otherExpensesSum = 0;
  
      // Process the data to separate salaries from other expenses
      expensesData.forEach(item => {
        const salary = parseFloat(item.Salary.replace(/,/g, '').trim()); // Remove commas, trim whitespace, and convert to number
        if (isNaN(salary)) return; // Skip if salary is not a valid number
  
        const name = item['Teachers Name'].trim().toLowerCase(); // Trim whitespace and convert to lowercase
        if (name.includes('cleaning') || 
            name.includes('wifi') ||
            name.includes('ice')) {
          otherExpensesSum += salary;
        } else {
          salarySum += salary;
        }
      });
  
      // Return the results
      res.json({
        salarySum,
        otherExpensesSum,
      });
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
  
    try {
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
          if (headers.includes('Cost for 200 Meals')) {
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
              const hasValidDate = row.Date && row.Date.trim() !== '' && row.Date !== 'TOTAL (PKR)';
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
  
      // Return the result
      console.log(sheetResults);
      res.json(sheetResults);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  


 

  
  // Convert months array to lowercase for case-insensitive comparison
  const months = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ].map(month => month.toLowerCase());
  
  app.get('/api/analytics/mealCostStudentAverage', async (req, res) => {
    const { quotationSheet, quotationWorkSheet, attendanceSheet, attendanceWorkSheet } = req.query;
  
    if (!quotationSheet || !quotationWorkSheet || !attendanceSheet || !attendanceWorkSheet) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }
  
    try {
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
      const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
      await attendanceDoc.loadInfo();
  
      // Get the current worksheet
      const currentExpensesSheetDoc = quotationDoc.sheetsById[quotationWorkSheet];
      if (!currentExpensesSheetDoc) {
        return res.status(404).json({ error: 'Current month expenses worksheet not found' });
      }
  
      // Get the name of the current worksheet and convert to lowercase
      const currentMonthName = currentExpensesSheetDoc.title.toLowerCase();
      const currentMonthIndex = months.indexOf(currentMonthName);
      if (currentMonthIndex === -1) {
        return res.status(400).json({ error: 'Invalid month name for current worksheet' });
      }
  
      // Determine the previous month's worksheet name
      const previousMonthIndex = (currentMonthIndex === 0) ? 11 : currentMonthIndex - 1;
      const previousWorkSheetName = months[previousMonthIndex];
  
      // Load all worksheets from quotation sheet
      const allQuotationSheets = quotationDoc.sheetsByIndex;
  
      // Search for the previous month's worksheet by title (case insensitive)
      let previousExpensesSheetDoc = null;
      for (const sheet of allQuotationSheets) {
        if (sheet.title.toLowerCase() === previousWorkSheetName) {
          previousExpensesSheetDoc = sheet;
          break;
        }
      }
  
      if (!previousExpensesSheetDoc) {
        return res.status(404).json({ error: 'Previous month expenses worksheet not found' });
      }
  
      // Get rows from the current and previous worksheets
      const currentExpensesRows = await currentExpensesSheetDoc.getRows();
      const previousExpensesRows = await previousExpensesSheetDoc.getRows();
  
      // Extract headers and convert rows to JSON
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
  
      const currentExpensesData = extractData(currentExpensesSheetDoc, currentExpensesRows);
      const previousExpensesData = extractData(previousExpensesSheetDoc, previousExpensesRows);
  
      // Filter out rows with invalid or empty dates and skip the last row (total)
      const filterValidData = (data) => {
        return data.filter((row) => {
          const hasValidDate = row.Date && row.Date.trim() !== '' && row.Date !== 'TOTAL (PKR)' && row.Date !== '*Sunday Excluded';
          const hasValidBoxes = row['No. Of Boxes'] && parseFloat(row['No. Of Boxes'].replace(/,/g, '')) !== 0;
          return hasValidDate && hasValidBoxes;
        });
      };
  
      const validCurrentData = filterValidData(currentExpensesData);
      const validPreviousData = filterValidData(previousExpensesData);
  
      const calculateAverageBoxes = (data) => {
        const { totalBoxes, daysWithBoxes } = data.reduce((acc, row) => {
          const boxes = parseFloat(row['No. Of Boxes'].replace(/,/g, ''));
          if (!isNaN(boxes) && boxes > 0) {
            acc.totalBoxes += boxes;
            acc.daysWithBoxes += 1;
          }
          return acc;
        }, { totalBoxes: 0, daysWithBoxes: 0 });
      
        return daysWithBoxes > 0 ? totalBoxes / daysWithBoxes : 0;
      };
      
  
      const averageBoxesCurrent = calculateAverageBoxes(validCurrentData);
      const averageBoxesPrevious = calculateAverageBoxes(validPreviousData);
  
      // Load all worksheets from attendance sheet
      const allAttendanceSheets = attendanceDoc.sheetsByIndex;
  
      // Get current attendance worksheet
      const attendanceSheetDocCurrent = attendanceDoc.sheetsById[Number(attendanceWorkSheet)];
      if (!attendanceSheetDocCurrent) {
        return res.status(404).json({ error: 'Current attendance worksheet not found' });
      }
  
      // Determine the previous attendance worksheet name
      const previousAttendanceWorkSheetName = months[previousMonthIndex];
  
      // Search for the previous month's attendance worksheet by title (case insensitive)
      let previousAttendanceSheetDoc = null;
      for (const sheet of allAttendanceSheets) {
        if (sheet.title.toLowerCase() === previousAttendanceWorkSheetName) {
          previousAttendanceSheetDoc = sheet;
          break;
        }
      }
  
      // Function to count students present
      const countStudentsPresent = (data) => {
        return data.reduce((acc, attendance) => {
          const date = attendance.Date;
          if (attendance.Time && attendance.Time.length > 0) { // Consider only present students
            if (!acc[date]) {
              acc[date] = 0;
            }
            acc[date]++;
          }
          return acc;
        }, {});
      };
  
      // Get rows from the current attendance worksheet
      const attendanceRowsCurrent = await attendanceSheetDocCurrent.getRows();
      const currentAttendanceData = extractData(attendanceSheetDocCurrent, attendanceRowsCurrent);
  
      let averageStudentsPresentPrevious = 0;
  
      if (previousAttendanceSheetDoc) {
        const attendanceRowsPrevious = await previousAttendanceSheetDoc.getRows();
        const previousAttendanceData = extractData(previousAttendanceSheetDoc, attendanceRowsPrevious);
        
        const attendanceCountByDatePrevious = countStudentsPresent(previousAttendanceData);
  
        // Function to calculate the overall average number of students present
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
        
  console.log("attendanceCountByDate prevous ",attendanceCountByDatePrevious);
        averageStudentsPresentPrevious = calculateAverageAttendance(attendanceCountByDatePrevious);
      }
  
      const attendanceCountByDateCurrent = countStudentsPresent(currentAttendanceData);
      console.log("attendanceCountByDate current ",attendanceCountByDateCurrent);
  
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
      
  
      const averageStudentsPresentCurrent = calculateAverageAttendance(attendanceCountByDateCurrent);
  
      // Return the result with worksheet names and averages
      res.json({
        currentWorksheet: currentMonthName,
        previousWorksheet: previousWorkSheetName,
        averageBoxesCurrent,
        averageBoxesPrevious,
        averageStudentsPresentCurrent,
        averageStudentsPresentPrevious
      });
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
  
    try {
      const attendanceDoc = new GoogleSpreadsheet(attendanceSheet, serviceAccountAuth);
      await attendanceDoc.loadInfo();
  
      const attendanceSheetDocCurrent = attendanceDoc.sheetsById[Number(attendanceWorkSheet)];
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
  
      res.json(response);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  

  
  
  
export default app;
