
 
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

const CACHE_EXPIRATION_SECONDS = 10800; // 3 hours

import serviceAccountAuth from '../helpers/authService.js';
import filterValidSheets from '../helpers/filterValidSheets.js';
import sortSheetTitles from '../helpers/sortSheetTitles.js';

 
 
 export  async function MealCost (req, res)  {
    const { quotationSheet } = req.query;
  
    if (!quotationSheet) {
      return res.status(400).json({ error: 'Sheet ID is required' });
    }
  
    const cacheKey = `mealCost:${quotationSheet}`;
     
    try {
      // Check Redis cache first
      const cachedData = await client.get(cacheKey);
      if (cachedData) {
        console.log('Serving data from cache');
        return res.json(JSON.parse(cachedData));
      }
  
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
      const validSheets=await filterValidSheets(quotationDoc);
      const sortedSheetTitles=sortSheetTitles(validSheets);
      const latestThreeMonths=sortedSheetTitles.slice(0,3);
      console.log("valid sheets for qutaion doc: ",latestThreeMonths);
      const sheetResults = {};
  
      // Iterate over all sheets
      for (const sheetTitle of latestThreeMonths) {
         
        const sheet = quotationDoc.sheetsByTitle[sheetTitle];
 
        try {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues.map(header => header.trim());
  console.log("headers here ",headers);
          // Check if the sheet contains the "Cost for 200 Meals" column
          if (headers.includes('Cost for 200 Meals')&&isSheetNameValid(sheet.title)){
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
              const date = row.Date;
              const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
              const hasValidDate = isValid(parsedDate) && date.trim() !== '' && date !== 'TOTAL (PKR)' && date !== '*Sunday Excluded';
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
   
      // Cache the result
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(sheetResults));
  
      // Return the result
      console.log(sheetResults);
      res.json(sheetResults);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };