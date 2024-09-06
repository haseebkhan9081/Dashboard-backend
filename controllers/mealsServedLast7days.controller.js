 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";
dotenv.config();
import client from '../helpers/redisClient.js';

const CACHE_EXPIRATION_SECONDS = 1*24*60*60; // 1 day
import serviceAccountAuth from '../helpers/authService.js';

export async function MealsServedLast7days (req, res)  {
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
  };
  