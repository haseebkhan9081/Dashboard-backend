 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";
dotenv.config();
import serviceAccountAuth from '../helpers/authService.js';
import client from '../helpers/redisClient.js';
const CACHE_EXPIRATION_SECONDS = 259200; // 3 days

 
 export async function AverageAttendanceUntilNow (req, res){
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
              acc[formattedDate] = 1;
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
  };