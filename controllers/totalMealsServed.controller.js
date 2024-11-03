 
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

const CACHE_EXPIRATION_SECONDS = 24*60*60; // 24 hours
import serviceAccountAuth from '../helpers/authService.js';

 
 export async function TotalMealsServed (req, res)  {
    const { quotationSheet } = req.query;
  
    if (!quotationSheet) {
      return res.status(400).json({ error: 'Sheet ID is required' });
    }
  
    const cacheKey = `totalMealsServed:${quotationSheet}`;
  
    try {
       const cachedData = await client.get(cacheKey);
      if (cachedData) {
        console.log('Serving data from cache');
        return res.json(JSON.parse(cachedData));
      }
  
      // Load the quotation sheet
      const quotationDoc = new GoogleSpreadsheet(quotationSheet, serviceAccountAuth);
      await quotationDoc.loadInfo();
  
      const sheetResults = {};
      let latestDate = null;
  
      // Iterate over all sheets
      for (const sheetId in quotationDoc.sheetsById) {
        const sheet = quotationDoc.sheetsById[sheetId];
  
        try {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues.map(header => header.trim());
  
          // Check if the sheet contains the "No. Of Boxes" column
          
          if (isSheetNameValid(sheet.title)&&headers.includes('No. Of Boxes')) {
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
              const hasValidBoxes = row['No. Of Boxes'].trim() !== '';
              return hasValidDate && hasValidBoxes && !isLastRow;
            });
  
            // console.log(`Valid data for sheet ${sheet.title}:`, validData);
  
            // Find the latest date
            validData.forEach(row => {
              const date = row.Date;
              const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
              // console.log(`Parsed date for row ${JSON.stringify(row)}:`, parsedDate);
              if (isValid(parsedDate) && (!latestDate || parsedDate > latestDate)) {
                latestDate = parsedDate;
                // console.log(`Updated latest date:`, latestDate);
              }
            });
  
            // Sum up the "No. Of Boxes"
            const totalCostMeals = validData.reduce((sum, row) => {
              const cost = parseFloat(row['No. Of Boxes'].replace(/,/g, ''));
              return sum + (isNaN(cost) ? 0 : cost);
            }, 0);
  
            // Store the result with the sheet name
            sheetResults[sheet.title] = totalCostMeals;
          }else{
            console.log('The sheet is not valid:', sheet.title);
          }
        } catch (error) {
          console.warn(`Error processing sheet ${sheet.title}:`, error.message);
          // You may want to handle individual sheet errors differently, e.g., continue processing other sheets
        }
      }
  
      // Calculate the total sum of "No. Of Boxes" across all sheets
      const totalMealsServed = Object.values(sheetResults).reduce((sum, value) => sum + value, 0);
  
      // Cache the result
      const formattedLatestDate = latestDate ? format(latestDate, 'MMMM/dd/yyyy', { locale: enUS }) : null;
      
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify({ totalMealsServed, formattedLatestDate }));
      // Return the result
      console.log({ totalMealsServed, formattedLatestDate });
      res.json({ totalMealsServed, formattedLatestDate });
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };