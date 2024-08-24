    
    import { GoogleSpreadsheet } from 'google-spreadsheet';
    
    import dotenv from 'dotenv';
    import { JWT } from 'google-auth-library';
    import { createClient } from 'redis';
    import { google } from 'googleapis';
    import { parse, isValid,format } from "date-fns";
    import {enUS} from "date-fns/locale";
    import filterValidSheets from '../helpers/filterValidSheets.js';
    import sortSheetTitles from '../helpers/sortSheetTitles.js';
import averageAttendancePerMonth from '../helpers/averageAttendancePerMonth.js';
    dotenv.config();
    const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD
    });

    client.on('error', (err) => {
    console.error('Redis error:', err);
    });

    client.connect().then(() => {
    console.log('Connected to Redis');
    });

    const CACHE_EXPIRATION_SECONDS = 10800; // 3 hours
    const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure new lines are preserved
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    }); 
    


    export async function AttendancePercentageIncrease (req,res){
        const {attendanceSheet } = req.query;
    
        if (!attendanceSheet) {
        return res.status(400).json({ error: 'Sheet IDs for attendance are required' });
        }

        const cacheKey = `AttendancePercentageIncrease:${attendanceSheet}`;


        try{
            //let's check if we already have the results in cache
            const cachedResult=await client.get(cacheKey);
                if(cachedResult){
                    console.log("Serving data from cache");
                    return res.json(JSON.parse(cachedResult));
                }
    //we will first load the main sheet here
    const attendanceDoc=new GoogleSpreadsheet(attendanceSheet,serviceAccountAuth);
    await attendanceDoc.loadInfo();
    console.log("Sheet loaded successfully ",attendanceDoc?.title);
    const validSheets=await filterValidSheets(attendanceDoc);
    console.log("valid sheets ",validSheets);
    const sortedSheetTitles=sortSheetTitles(validSheets);
    console.log(sortedSheetTitles);
    const latestMonth=sortedSheetTitles.slice(0,1)[0];
    const titles=['June 2024']
    titles.push(latestMonth)
    const averageAttendancePerM=await averageAttendancePerMonth(attendanceDoc,titles);
    
    console.log("data for the latest month ",averageAttendancePerM[latestMonth])
    const AttendancePercentageIncreaseResult=(((averageAttendancePerM[latestMonth]?.averageStudentsPresent-averageAttendancePerM[titles[0]]?.averageStudentsPresent)/averageAttendancePerM[titles[0]]?.averageStudentsPresent)*100).toFixed(2);
    return res.json(Number(AttendancePercentageIncreaseResult));
        }catch(error){
        console.error('Error accessing Google Sheets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
        }
    }