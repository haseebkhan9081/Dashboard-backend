
 
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { createClient } from 'redis';
import { google } from 'googleapis';
import { parse, isValid,format } from "date-fns";
import {enUS} from "date-fns/locale";
dotenv.config();
import client from '../helpers/redisClient.js';

const CACHE_EXPIRATION_SECONDS = 30*24*60*60; // 30 days
import serviceAccountAuth from '../helpers/authService.js';


  export async function QuotationperMeal (req, res){
    const { quotationSheet, quotationWorkSheet } = req.query;

    if (!quotationSheet || !quotationWorkSheet) {
        return res.status(400).json({ error: 'All sheet and worksheet IDs are required' });
    }

    const cacheKey = `quotationperMeal:${quotationSheet}:${quotationWorkSheet}`;

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

        // Clean the worksheet title
        const cleanTitle = (title) => {
            return title.trim().replace(/\s+/g, ' ').toLowerCase();
        };

        // Get all worksheet titles
        const worksheetTitles = quotationDoc.sheetsByIndex.map(sheet => sheet.title);
        
        // Find the matching worksheet by comparing cleaned titles (case insensitive)
        const targetWorksheet = worksheetTitles.find(title => cleanTitle(title) === cleanTitle(quotationWorkSheet));

        if (!targetWorksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        // Load the specific worksheet by title
        const worksheet = quotationDoc.sheetsByTitle[targetWorksheet];
        await worksheet.loadCells('D4:F'); // Load cells from D4 to the last F column

        const data = [];
        let rowIndex = 5; // Start from row 4

        // Iterate through rows starting from D4
        while (true) {
            const mealPlanCell = worksheet.getCell(rowIndex, 3); // Column D (index 3)
            const quotationsCell = worksheet.getCell(rowIndex, 4); // Column E (index 4)
            const costCell = worksheet.getCell(rowIndex, 5); // Column F (index 5)

            // Break the loop if there's no more data in the Meal Plan column
            if (!mealPlanCell.value) break;

            // Ensure cell values are strings and trim them
            const mealPlan = (mealPlanCell.value || '').toString().trim();
            const quotations = (quotationsCell.value || '').toString().trim();
            const costFor200Meals = (costCell.value || '').toString().trim();

            data.push({
                mealPlan,
                quotations,
                costFor200Meals
            });

            rowIndex++;
        }

        // Cache the result
        await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(data));

        // Return the result
        res.json(data);

    } catch (error) {
        console.error('Error accessing Google Sheets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};