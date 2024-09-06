 
 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";
dotenv.config();
import client from '../helpers/redisClient.js';

const CACHE_EXPIRATION_SECONDS = 6*24*60*60; // 6 days
import serviceAccountAuth from '../helpers/authService.js';


 export async function StudentAveragePerClass (req, res)  {
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
  };