 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
dotenv.config();
import serviceAccountAuth from '../helpers/authService.js';
import client from '../helpers/redisClient.js';
import SumStudentsFromAllDepartments from '../helpers/SumStudentsFromAllDepartments.js';
const CACHE_EXPIRATION_SECONDS = 7*24*60*60; // 7 days

 
export async function AverageAttendanceUntilNow (req, res){
    const { attendanceSheet } = req.query;
  
    if (!attendanceSheet) {
      return res.status(400).json({ error: 'Attendance sheet ID is required' });
    }
  
    const cacheKey = `averageAttendanceUntilNow:${attendanceSheet}`;
  
    try {
      // Check if result is cached
      const cachedResult = await client.get(cacheKey);
      // if (cachedResult) {
      //   console.log("Serving data from cache");
      //   return res.json(JSON.parse(cachedResult));
      // }
  
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
            if (!acc[date]) {
              acc[date] = 0;
            }
            acc[date]++;
          }
          return acc;
        }, {});
      };
      
       
  
      let totalPresentStudents = 0;
      let totalDaysWithAttendance = 0;
  
      for (const sheet of allAttendanceSheets) {
        const attendanceRows = await sheet.getRows();
        const attendanceData = extractData(sheet, attendanceRows);
        console.log("attendance data ",attendanceData);
        let attendanceCountByDate;
        if(attendanceData.some(item => item.hasOwnProperty('Total') && item.hasOwnProperty('Present'))){
console.log("yes this is the changed data");


attendanceCountByDate=SumStudentsFromAllDepartments(attendanceData);
        }else{
          attendanceCountByDate = countStudentsPresent(attendanceData);
        }
 console.log("count present students ",attendanceCountByDate);
        

 const { totalPresent, daysWithAtt } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
  if (count > 0) {
    acc.totalPresent += count;
    acc.daysWithAtt += 1;
  }
 
  return acc;
}, { totalPresent: 0, daysWithAtt: 0 });
        totalPresentStudents += totalPresent;
        totalDaysWithAttendance += daysWithAtt
 

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
