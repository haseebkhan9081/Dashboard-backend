    
    import { GoogleSpreadsheet } from 'google-spreadsheet';
    
    import dotenv from 'dotenv';
    import { JWT } from 'google-auth-library';
    import client from '../helpers/redisClient.js';
    import filterValidSheets from '../helpers/filterValidSheets.js';
    import sortSheetTitles from '../helpers/sortSheetTitles.js';
import averageAttendancePerMonth from '../helpers/averageAttendancePerMonth.js';
    dotenv.config();
    const CACHE_EXPIRATION_SECONDS = 259200; // 3 days
    import serviceAccountAuth from '../helpers/authService.js';
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
    await client.setEx(cacheKey,CACHE_EXPIRATION_SECONDS,JSON.stringify(Number(AttendancePercentageIncreaseResult)));
    return res.json(Number(AttendancePercentageIncreaseResult));
        }catch(error){
        console.error('Error accessing Google Sheets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
        }
    }