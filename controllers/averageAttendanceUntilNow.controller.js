 
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
import countStudentsPresent from '../helpers/countStudentsPresent.js';
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
  
       
      
       
  
      let totalPresentStudents = 0;
      let totalDaysWithAttendance = 0;
  
      for (const sheet of allAttendanceSheets) {
        const attendanceRows = await sheet.getRows();
        const attendanceData = extractData(sheet, attendanceRows);
     
        let attendanceCountByDate;
        if(attendanceData.some(item => item.hasOwnProperty('Total') && item.hasOwnProperty('Present'))){
 


attendanceCountByDate=SumStudentsFromAllDepartments(attendanceData);
        }else{
          attendanceCountByDate = countStudentsPresent(attendanceData);
        }
 console.log("count present students ",attendanceCountByDate);
        

 const { totalPresent, daysWithAtt } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
  const parsedDate=parse(date,'MM/dd/yyyy', new Date())
  if(!isValid(parsedDate)){
    console.log("not valid Skipping ",date);
    return acc;
  }
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
