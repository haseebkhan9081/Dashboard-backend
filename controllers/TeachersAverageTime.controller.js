
import { GoogleSpreadsheet } from 'google-spreadsheet';
 
import serviceAccountAuth from "../helpers/authService.js";

import client from "../helpers/redisClient.js";
import extractData from '../helpers/extractData.js';
import { differenceInMinutes, parse } from 'date-fns';
const CACHE_EXPIRATION_SECONDS = 7*24*60*60; // 1 day

export async function TeachersAverageTime(req,res) {
   const {attendanceSheet,attendanceWorkSheet}=req.query;
   
   if (!attendanceSheet) {
    return res.status(400).json({ error: 'Sheet IDs for attendance are required' });
    }

    const cacheKey = `TeachersAverageTime:${attendanceSheet}:${attendanceWorkSheet}`;
try{
    const cachedResult=await client.get(cacheKey);
if(cachedResult){
    console.log("Serving data from cache")
    return res.json(JSON.parse(cachedResult));
}
const attendanceDoc=new GoogleSpreadsheet(attendanceSheet,serviceAccountAuth);
await attendanceDoc.loadInfo();
console.log("Sheet loaded successfully ",attendanceDoc?.title);
const Worksheet=attendanceDoc.sheetsByTitle[attendanceWorkSheet];
 
 
const rows=await Worksheet.getRows();
const extractedData=await extractData(Worksheet,rows);
 
if(extractedData.some(item => item.hasOwnProperty('Total') && item.hasOwnProperty('Present'))){
    return  res.status(201).json({data:[]})
}
let filterArray = ['142', '170'];
let staffAttendance = extractedData.filter(
  (data) =>
    data.Department === 'Main Library' && !filterArray.includes(data['AC-No'])
);
function calculateDuration(startTime, endTime) {
    const start = parse(startTime, "HH:mm", new Date());
    const end = parse(endTime, "HH:mm", new Date());
    return differenceInMinutes(end, start); // Returns duration in minutes
  }
  let results = {};

  for (let attendance of staffAttendance) {
    const acNo = attendance["AC-No"];
    if (attendance["Time"].length==0) {
        const dateStr = attendance["Date"]; // Assuming the date format is MM/DD/YYYY
    const date = parse(dateStr, "MM/dd/yyyy", new Date()); // Parse the date string into a Date object

    // Check if the day is Sunday (0 represents Sunday)
    const dayOfWeek = date.getDay(); // Returns a number from 0 (Sunday) to 6 (Saturday)
    
     
    if (!(dayOfWeek === 0)) {
      // Initialize absenceCount if not present
      if (!results[acNo]) {
        results[acNo] = { totalDuration: 0, count: 0, absenceCount: 0, Name: attendance["Name"] };
      }
      results[acNo].absenceCount++;  // Increment absence count
    }
   continue;
      }
    
    const timeLogs = attendance["Time"].split(" "); // Split the time logs (e.g., "16:14 20:07")
  
    // Skip if Time is empty or contains only one log
    if (timeLogs.length < 2) {
      continue;
    }
  
    // Consider only the first and last time logs
    const startTime = timeLogs[0];
    const endTime = timeLogs[timeLogs.length - 1];
    
    // Calculate the duration between the first and last time log
    const duration = calculateDuration(startTime, endTime);
    
    // If this AC-No is not in the results, initialize its entry
    if (!results[acNo]) {
      results[acNo] = { totalDuration: 0, count: 0 ,Name:attendance["Name"],absenceCount: 0};
    }
    
    // Add the duration and increment the count for this AC-No
    results[acNo].totalDuration += duration;
    results[acNo].count++;
  }
  let data = [];

for (let acNo in results) {
  let averageDuration = results[acNo].totalDuration / results[acNo].count;

  // Round the average duration to the nearest minute
  let roundedDuration = Math.round(averageDuration);

  // Convert the duration into hours and minutes
  let hours = Math.floor(roundedDuration / 60);
  let minutes = roundedDuration % 60;

  // Format the time label (HH:mm)
  let timeLabel = `${String(hours).padStart(2, "0")+'h'}:${String(minutes).padStart(2, "0")+'m'}`;

  // Create a chart-friendly object with the numerical value and the label
  data.push({
    acNo: acNo,
    timeValue: roundedDuration, // Numerical value in minutes (good for calculations or charts)
    timeLabel: timeLabel, // Formatted string for display (e.g., "02:30")
    Name: results[acNo].Name,
    Absent: `${results[acNo].absenceCount} ${results[acNo].absenceCount === 1 ? 'day' : 'days'}` // Use 'day' for 1 and 'days' for others
});

}


 
await client.setEx(cacheKey, CACHE_EXPIRATION_SECONDS, JSON.stringify(data));

res.status(201).json(data)
}

catch(err){

}

}