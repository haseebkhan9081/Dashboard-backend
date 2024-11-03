 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";
import isSheetNameValid from '../helpers/isSheetNameValid.js';
dotenv.config();
import client from '../helpers/redisClient.js';
import serviceAccountAuth from '../helpers/authService.js';
const CACHE_EXPIRATION_SECONDS = 6*24*60*60; // 6 days
import sortSheetTitles from "../helpers/sortSheetTitles.js"
import SumStudentsFromAllDepartments from '../helpers/SumStudentsFromAllDepartments.js';
import countStudentsPresent from '../helpers/countStudentsPresent.js';

export  async function AverageStudentVsBoxes (req, res){
    const { quotationSheet, attendanceSheet } = req.query;
  
    if (!quotationSheet || !attendanceSheet) {
      return res.status(400).json({ error: 'Sheet IDs for both quotation and attendance are required' });
    }
  
    const cacheKey = `AverageStudentVsBoxes:${quotationSheet}:${attendanceSheet}`;
  
    try {
      // Check if result is cached
      const cachedResult = await client.get(cacheKey);
      // if (cachedResult) {
      //   console.log("Serving data from cache");
      //   console.log(cachedResult);
      //   return res.json(JSON.parse(cachedResult));
      // }
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
      //    console.log(`Fetching data for quotation sheet: ${sheetTitle}`);
          const sheetDoc = quotationDoc.sheetsByIndex.find(sheet => cleanTitle(sheet.title).toLowerCase() === sheetTitle.toLowerCase());
  
          if (!sheetDoc) {
            console.warn(`Quotation sheet not found: ${sheetTitle}`);
            continue;
          }
  
          const rows = await sheetDoc.getRows();
                 const extracteData=   await  extractData(sheetDoc,rows);
          // console.log("extractData  : ",extracteData);
          const data = extracteData.map(row => ({
            Date: row.Date,
            'No. Of Boxes': row['No. Of Boxes'],
          }));
  
      //    console.log(`Data for quotation sheet ${sheetTitle}:`, data);
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
    console.log("no of boxes :",noOfBoxes);
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
  
        //  console.log(`Results for ${sheetTitle}:`, results[`${capitalizeFirstLetter(extractMonthAndYear(sheetTitle).month)} ${extractMonthAndYear(sheetTitle).year}`]);
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
  
          if (!sheetDoc||!isSheetNameValid(sheetTitle)) {
            console.warn(`Attendance sheet not found: ${sheetTitle}`);
            continue;
          }
  
          const rows = await sheetDoc.getRows();
          const extracteData=   await  extractData(sheetDoc,rows);
           
  
         // console.log(`Data for attendance sheet ${sheetTitle}:`, extracteData.slice(0,3));
  
           

          let attendanceCountByDate;
          if(extracteData.some(item => item.hasOwnProperty('Total') && item.hasOwnProperty('Present'))){
            console.log("yes this is the updated data");
            
            
            attendanceCountByDate=SumStudentsFromAllDepartments(extracteData);
                    }else{

                   
            attendanceCountByDate = countStudentsPresent(extracteData);
        }
         // console.log("students present by date ",attendanceCountByDate);
  
          const calculateAverageAttendance = (attendanceCountByDate) => {
            // Log the initial attendance count by date
           // console.log("Attendance Count By Date:", attendanceCountByDate);
          
            // Reduce to calculate total attendance and number of dates with positive attendance
            const { totalPresentStudents, daysWithAttendance } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
              console.log(`Processing Date: ${date}, Count: ${count}`);
              
              if (count > 0) {  // Only include dates where there is positive attendance
                acc.totalPresentStudents += count;
                acc.daysWithAttendance += 1;
              }
          
              // Log the accumulated values after each iteration
              // console.log(`Accumulated Total Present Students: ${acc.totalPresentStudents}`);
              // console.log(`Accumulated Days With Attendance: ${acc.daysWithAttendance}`);
              
              return acc;
            }, { totalPresentStudents: 0, daysWithAttendance: 0 });
          
            // Calculate the average attendance
            const averageAttendance = daysWithAttendance > 0 ? totalPresentStudents / daysWithAttendance : 0;
          
            // Log the final calculated average
         //   console.log("Final Average Attendance:", averageAttendance);
          
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
  
      //    console.log(`Results for ${sheetTitle}:`, results[key]);
        }
  
        return results;
      };
  
      const attendanceTitles = attendanceDoc.sheetsByIndex.map(sheet => cleanTitle(sheet.title));
      
      const sortedTitles=sortSheetTitles(attendanceTitles);
       

      const attendanceResults = await processAttendanceSheets(attendanceDoc, sortedTitles.slice(0,3));
      //console.log("qu result", quotationResults);
     //console.log("att result", attendanceResults);
  
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
  
 // console.log("Returning results:", finalResults);
  
      
      // Cache the result
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(finalResults));
  
      //console.log("Returning results:", finalResults);
  
      // Return the result
      res.json(finalResults);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };