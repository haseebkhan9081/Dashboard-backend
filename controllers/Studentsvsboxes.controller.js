import { GoogleSpreadsheet } from 'google-spreadsheet';
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
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure new lines are preserved
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
});

 export async function Studentsvsboxes (req, res)  {
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
  };