// api/index.js
import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import serverless from 'serverless-http';

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
  const { attendanceSheet, quotationSheet, attendanceWorkSheet, quotationWorkSheet, expensesWorkSheet } = req.query;

  if (!attendanceSheet || !quotationSheet || !attendanceWorkSheet || !quotationWorkSheet || !expensesWorkSheet) {
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

    // Load the expenses sheet and worksheet
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
          rowData[header] = row._rawData[index];
        });
        return rowData;
      });
    };

    const attendanceData = extractData(attendanceSheetDoc, attendanceRows);
    const quotationData = extractData(quotationSheetDoc, quotationRows);
    const expensesData = extractData(expensesSheetDoc, expensesRows);
    expensesData.pop();

    const attendanceCountByDate = attendanceData.reduce((acc, attendance) => {
      const date = attendance.Date;
      if (!attendance.Absent) { // Consider only present employees
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
          NoOfBoxes: quotation['No. Of Boxes'],
          NoOfPresents: attendanceCountByDate[date] || 0
        };
      });

    const resultData = cleanedQuotationData.map(quotation => {
      const date = quotation.Date;
      return {
        Date: date,
        NoOfBoxes: quotation.NoOfBoxes, // Accessing the 'No. Of Boxes' field
        NoOfPresents: attendanceCountByDate[date] || 0
      };
    });

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
            name.includes('ice') ||
            name.includes('technical support intern')) {
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
    const { quotationSheet, quotationWorkSheet } = req.query;
  
    if (!quotationSheet || !quotationWorkSheet) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }
  
    try {
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
  
      // Load the expenses sheet
      const expensesSheetDoc = quotationDoc.sheetsById[quotationWorkSheet];
      if (!expensesSheetDoc) {
        return res.status(404).json({ error: 'Expenses worksheet not found' });
      }
      const expensesRows = await expensesSheetDoc.getRows();
  
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
  
      const expensesData = extractData(expensesSheetDoc, expensesRows);
  
      // Filter out rows with invalid or empty dates and skip the last row (total)
      const validData = expensesData.filter((row, index, array) => {
        const isLastRow = index === array.length - 1;
        const hasValidDate = row.Date && row.Date.trim() !== '' && row.Date !== 'TOTAL (PKR)';
        return hasValidDate && !isLastRow;
      });
  
      // Sum up the "Cost for 200 Meals"
      const totalCostFor200Meals = validData.reduce((sum, row) => {
        const cost = parseFloat(row['Cost for 200 Meals'].replace(/,/g, ''));
        return sum + (isNaN(cost) ? 0 : cost);
      }, 0);
  
      // Return the result
      res.json({ totalCostFor200Meals });
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  
  
export default app;
