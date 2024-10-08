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
import averageStudentVsBoxesRoutes from './routes/averageStudentsVsAverageBoxes.route.js';
import quotationperMealRoute from "./routes/quotationperMeal.route.js";
import averageAttendanceUntilNowRoute from "./routes/averageAttendanceUntilNow.route.js";
import mealsServedLast7daysRoute from "./routes/mealsServedLast7days.route.js"
import totalMealsServedRoute from "./routes/totalMealsServed.route.js"
import studentAveragePerClassRoute from "./routes/studentAveragePerClass.route.js";
import mealCostRoute from "./routes/mealCost.route.js"
import expensesRoute from "./routes/expenses.route.js"
import StudentsvsboxesRoute from "./routes/Studentsvsboxes.route.js"
import attendancePercentageIncreaseRoute from "./routes/attendancePercentageIncrease.route.js";
import attendanceSummaryByDateRoute from "./routes/attendanceSummarybyDate.route.js"
import redisRoute from "./routes/redis.route.js";
import client from './helpers/redisClient.js';
const CACHE_EXPIRATION_SECONDS = 10800; // 3 hours
const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = [
  process.env.SERVER_URL, // First origin from environment variable
  process.env.NOURISHED_SERVER  // Second origin from environment variable
]

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Reject the request
    }
  }
};
app.use(cors()); // Allows all origins
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
app.use("/api/redis",redisRoute);
app.use("/api/analytics",StudentsvsboxesRoute);
app.use("/api/analytics",expensesRoute);
app.use("/api/analytics",mealCostRoute);  
app.use("/api/analytics",studentAveragePerClassRoute);   
app.use("/api/analytics",totalMealsServedRoute); 
app.use("/api/analytics",mealsServedLast7daysRoute);
app.use("/api/analytics",quotationperMealRoute);
app.use("/api/analytics",averageStudentVsBoxesRoutes);
app.use("/api/analytics",averageAttendanceUntilNowRoute);
app.use("/api/analytics",attendancePercentageIncreaseRoute);
app.use("/api/analytics",attendanceSummaryByDateRoute);
  
export default app;
