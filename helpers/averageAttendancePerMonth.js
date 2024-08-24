import { capitalizeFirstLetter } from "./capitalizeFirstLetter.js";
import cleanTitle from "./cleanTitle.js";
import extractData from "./extractData.js";
import extractMonthAndYear from "./extractMonthAndYear.js";

const averageAttendancePerMonth = async (doc, titles) => {
    const results = {};

    for (const sheetTitle of titles) {
      console.log(`Fetching data for attendance sheet: ${sheetTitle}`);
      const sheetDoc = doc.sheetsByIndex.find(sheet => cleanTitle(sheet.title).toLowerCase() === sheetTitle.toLowerCase());

      if (!sheetDoc) {
        console.warn(`Attendance sheet not found: ${sheetTitle}`);
        continue;
      }

      const rows = await sheetDoc.getRows();
      const extracteData=   await  extractData(sheetDoc,rows);
      const data = extracteData.map(row => ({
        Date: row.Date,
        Time: row.Time,
        Name:row.Name,
        Department:row.Department
      }));

      console.log(`Data for attendance sheet ${sheetTitle}:`, data.slice(0,3));

      const countStudentsPresent = (data) => {
        return data.reduce((acc, row) => {
          const date = row.Date;
          if (row.Time && row.Time.length > 0) {
            if (!acc[date]) {
              acc[date] = 1;
            }
            acc[date]++;
          }
          return acc;
        }, {});
      };

      const attendanceCountByDate = countStudentsPresent(data);
      console.log("students present by date ",attendanceCountByDate);

      const calculateAverageAttendance = (attendanceCountByDate) => {
        // Log the initial attendance count by date
        console.log("Attendance Count By Date:", attendanceCountByDate);
      
        // Reduce to calculate total attendance and number of dates with positive attendance
        const { totalPresentStudents, daysWithAttendance } = Object.entries(attendanceCountByDate).reduce((acc, [date, count]) => {
          console.log(`Processing Date: ${date}, Count: ${count}`);
          
          if (count > 0) {  // Only include dates where there is positive attendance
            acc.totalPresentStudents += count;
            acc.daysWithAttendance += 1;
          }
      
          // Log the accumulated values after each iteration
          console.log(`Accumulated Total Present Students: ${acc.totalPresentStudents}`);
          console.log(`Accumulated Days With Attendance: ${acc.daysWithAttendance}`);
          
          return acc;
        }, { totalPresentStudents: 0, daysWithAttendance: 0 });
      
        // Calculate the average attendance
        const averageAttendance = daysWithAttendance > 0 ? totalPresentStudents / daysWithAttendance : 0;
      
        // Log the final calculated average
        console.log("Final Average Attendance:", averageAttendance);
      
        return averageAttendance;
      };
      

      const averageAttendance = calculateAverageAttendance(attendanceCountByDate);

      const { month, year } = extractMonthAndYear(sheetTitle);
      const key = `${capitalizeFirstLetter(month)} ${year}`;

      if (results[key]) {
        results[key].averageStudentsPresent = averageAttendance;
      } else {
        results[key] = {
          averageStudentsPresent: averageAttendance || 0,
        };
      }

      console.log(`Results for ${sheetTitle}:`, results[key]);
    }

    return results;
  };

  export default averageAttendancePerMonth;