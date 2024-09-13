 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
 
dotenv.config();
import client from '../helpers/redisClient.js';
import serviceAccountAuth from '../helpers/authService.js';
const CACHE_EXPIRATION_SECONDS = 7*24*60*60; // 7 days
 


export async function Expenses (req, res){
    const { quotationSheet, expensesWorkSheet, month} = req.query;
  
    if (!quotationSheet || !expensesWorkSheet || !month) {
      return res.status(400).json({ error: 'All sheet and worksheet IDs and month are required' });
    }
  
    const cleanMonthName = (month) => {
      return month.trim().replace(/\s+/g, ' ').toLowerCase();
    };
  
    const cleanMonth = cleanMonthName(month);
    const cacheKey = `expenses:${quotationSheet}:${expensesWorkSheet}:${cleanMonth}`;
  
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
  
      // Load the expenses sheet
      const expensesSheetDoc = quotationDoc.sheetsByTitle[expensesWorkSheet];
      if (!expensesSheetDoc) {
        return res.status(404).json({ error: 'Expenses worksheet not found' });
      }
      const expensesRows = await expensesSheetDoc.getRows();
  
      // Find the column indices for the specified month
      const monthColumnStartIndex = expensesSheetDoc.headerValues.findIndex(header => cleanMonthName(header) === cleanMonth);
      if (monthColumnStartIndex === -1) {
        return res.status(404).json({ error: `Month ${month} not found in the worksheet` });
      }
  
      // Adjust the end column index for the merged header
      const monthColumnEndIndex = monthColumnStartIndex + 1; // Assuming next column contains salary data
  
      console.log('Month Column Start Index:', monthColumnStartIndex);
      console.log('Month Column End Index:', monthColumnEndIndex);
  
      // Initialize sums for the month
      let salarySum = 0;
      let otherExpensesSum = 0;
  
      // Process the data to separate salaries from other expenses
      expensesRows.forEach(row => {
        // Use only the relevant columns
        const name = row._rawData[monthColumnStartIndex]?.trim().toLowerCase();
        const salary = row._rawData[monthColumnEndIndex]?.trim();
  
        // Log the values for debugging
        console.log('Row Data:', row._rawData);
        console.log('Name Column Value:', name);
        console.log('Salary Column Value:', salary);
  
        // Exclude rows where the name is "total" or salary is invalid
        if (!name || name === 'total' || !salary || isNaN(parseFloat(salary.replace(/,/g, '').trim()))) {
          console.log('Skipping row due to invalid data:', JSON.stringify(row._rawData));
          return;
        }
  
        console.log('Processing row:', JSON.stringify(row._rawData));
        console.log('Name:', name);
        console.log('Salary:', salary);
  
        const parsedSalary = parseFloat(salary.replace(/,/g, '').trim());
  
        if (name.includes('cleaning') ||
        name.includes('wifi') ||
        name.includes('ice') ||
        name.includes('rent') ||
        name.includes('electricity') ||
        name.includes('water') ||
        name.includes('gas') ||
        name.includes('energy') ||
        name.includes('internet') ||
        name.includes('broadband') ||
        name.includes('phone') ||
        name.includes('mobile') ||
        name.includes('landline') ||
        name.includes('stationery') ||
        name.includes('paper') ||
        name.includes('pens') ||
        name.includes('insurance') ||
        name.includes('policy') ||
        name.includes('fuel') ||
        name.includes('transport') ||
        name.includes('uber') ||
        name.includes('taxi') ||
        name.includes('bus') ||
        name.includes('meal') ||
        name.includes('lunch') ||
        name.includes('food') ||
        name.includes('dinner') ||
        name.includes('flight') ||
        name.includes('hotel') ||
        name.includes('accommodation') ||
        name.includes('airbnb') ||
        name.includes('advertising') ||
        name.includes('promo') ||
        name.includes('marketing') ||
        name.includes('ad') ||
        name.includes('subscription') ||
        name.includes('software') ||
        name.includes('service') ||
        name.includes('membership') ||
        name.includes('legal') ||
        name.includes('lawyer') ||
        name.includes('court') ||
        name.includes('consultant') ||
        name.includes('advice') ||
        name.includes('consulting') ||
        name.includes('maintenance') ||
        name.includes('repair') ||
        name.includes('IT') ||
        name.includes('hardware') ||
        name.includes('training') ||
        name.includes('course') ||
        name.includes('workshop') ||
        name.includes('license') ||
        name.includes('permit') ||
        name.includes('tax') ||
        name.includes('VAT') ||
        name.includes('GST') ||
        name.includes('misc') ||
        name.includes('miscellaneous')
        ) {
          otherExpensesSum += parsedSalary;
        } else {
          salarySum += parsedSalary;
        }
      });
  
      console.log('Salary Sum:', salarySum);
      console.log('Other Expenses Sum:', otherExpensesSum);
      const capitalizeFirstLetter = (string) => {
        return string.charAt(0).toUpperCase() + string.slice(1);
      };
      
      // Grouped data structure
      const resultData = {
        [capitalizeFirstLetter(cleanMonth)]: {
          salarySum,
          otherExpensesSum
        }
      };
      
  
      // Cache the result data in Redis
      await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(resultData));
  
      // Return the results
      res.json(resultData);
    } catch (error) {
      console.error('Error accessing Google Sheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };