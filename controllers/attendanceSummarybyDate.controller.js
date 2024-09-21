import { GoogleSpreadsheet } from "google-spreadsheet";
import serviceAccountAuth from "../helpers/authService.js";
import client from "../helpers/redisClient.js";
import { format, parse } from "date-fns";
import filterValidSheets from "../helpers/filterValidSheets.js";
import extractData from "../helpers/extractData.js";


const CACHE_EXPIRATION_SECONDS = 7*24*60*60; // 7 days
export async function AttendanceSummaryByDate(req,res){
    const {attendanceSheet,date } = req.query;

    if (!attendanceSheet) {
        return res.status(400).json({ error: 'Sheet IDs for attendance are required' });
        }

        const cacheKey = `AttendanceSummaryByDate:${attendanceSheet}:${date}`;


        try{
const cachedResult=await client.get(cacheKey);
if(cachedResult){
    console.log("Serving data from cache")
    return res.json(JSON.parse(cachedResult));
}


const attendanceDoc=new GoogleSpreadsheet(attendanceSheet,serviceAccountAuth);
await attendanceDoc.loadInfo();
console.log("Sheet loaded successfully ",attendanceDoc?.title);

const parsedDate=parse(date,'MM/dd/yyyy',new Date());

const monthAndYear = format(parsedDate, 'MMMM yyyy');
console.log("month and year obtained ",monthAndYear);
const validSheets=await filterValidSheets(attendanceDoc);
console.log("validSheets ",validSheets);
if(validSheets.includes(monthAndYear)){
    console.log("worksheet was found ",monthAndYear);
}

const Worksheet=attendanceDoc.sheetsByTitle[monthAndYear];
 
const rows=await Worksheet.getRows();
const extractedData=await extractData(Worksheet,rows);


const attendanceDataByDate=extractedData.filter(row=>row.Date===date);
 


 
  console.log("date in backend ",date);
  // Step 1: Filter the records where the 'Time' is empty and set 'status' to 'Absent'
  const filteredData = attendanceDataByDate.filter(row => !row.Time || row.Time.trim() === '').map(row => ({
    ...row,
    status: 'Absent'
  }));
  
  // Step 2: Group the filtered records by 'Department'
  const groupedData = filteredData.reduce((acc, row) => {
    const dept = row.Department;
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(row);
    return acc;
  }, {});
  
  console.log("groupedData finally ",groupedData);
  if(Object.keys(groupedData).length!==0){

  await client.setEx(cacheKey,CACHE_EXPIRATION_SECONDS,JSON.stringify({
    AbsentsData:groupedData,
    Present:attendanceDataByDate.length-filteredData.length,
    Absent:filteredData.length
  }));}

return res.json({
  AbsentsData:groupedData,
  Present:attendanceDataByDate.length-filteredData.length,
  Absent:filteredData.length
});


        }catch(err){
            console.error('Error accessing Google Sheets:', err);
          res.status(500).json({ error: 'Internal Server Error' });
        }

}