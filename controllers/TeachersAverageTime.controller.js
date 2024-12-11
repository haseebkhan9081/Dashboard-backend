import { GoogleSpreadsheet } from "google-spreadsheet";

import serviceAccountAuth from "../helpers/authService.js";

import client from "../helpers/redisClient.js";
import extractData from "../helpers/extractData.js";
import { differenceInMinutes, parse } from "date-fns";

const CACHE_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 1 day

export async function TeachersAverageTime(req, res) {
  const { attendanceSheet, attendanceWorkSheet } = req.query;

  if (!attendanceSheet) {
    return res
      .status(400)
      .json({ error: "Sheet IDs for attendance are required" });
  }

  const cacheKey = `TeachersAverageTime:${attendanceSheet}:${attendanceWorkSheet}`;

  try {
    const cachedResult = await client.get(cacheKey);
    if (cachedResult) {
      console.log("Serving data from cache");
      return res.json(JSON.parse(cachedResult));
    }

    const attendanceDoc = new GoogleSpreadsheet(
      attendanceSheet,
      serviceAccountAuth
    );
    await attendanceDoc.loadInfo();
    console.log("Sheet loaded successfully ", attendanceDoc?.title);
    const Worksheet = attendanceDoc.sheetsByTitle[attendanceWorkSheet];

    const rows = await Worksheet.getRows();
    const extractedData = await extractData(Worksheet, rows);

    if (
      extractedData.some(
        (item) => item.hasOwnProperty("Total") && item.hasOwnProperty("Present")
      )
    ) {
      return res.status(201).json({ data: [] });
    }

    const filterArray = ["142", "170"];

    const staffAttendance = extractedData.filter((data) => {
      return (
        data.Department === "Main Library" &&
        !filterArray.includes(data["AC-No"])
      );
    });

    function calculateDuration(startTime, endTime) {
      const start = parse(startTime, "HH:mm", new Date());
      const end = parse(endTime, "HH:mm", new Date());
      return differenceInMinutes(end, start); // Returns duration in minutes
    }

    let groupedAttendance = {};

    // Group records by AC-No
    for (let attendance of staffAttendance) {
      const acNo = attendance["AC-No"];
      if (!groupedAttendance[acNo]) {
        groupedAttendance[acNo] = [];
      }
      groupedAttendance[acNo].push(attendance);
    }

    let results = {};

    // Process the last 7 records for each AC-No
    for (let acNo in groupedAttendance) {
      const lastSevenRecords = groupedAttendance[acNo].slice(-7);

      for (let attendance of lastSevenRecords) {
        if (attendance["Time"].length === 0) {
          const dateStr = attendance["Date"];
          const date = parse(dateStr, "MM/dd/yyyy", new Date());

          const dayOfWeek = date.getDay();

          if (!(dayOfWeek === 0)) {
            if (!results[acNo]) {
              results[acNo] = {
                totalDuration: 0,
                count: 0,
                absenceCount: 0,
                Name: attendance["Name"],
              };
            }
            results[acNo].absenceCount++;
          }
          continue;
        }

        const timeLogs = attendance["Time"].split(" ");

        if (timeLogs.length < 2) {
          continue;
        }

        const startTime = timeLogs[0];
        const endTime = timeLogs[timeLogs.length - 1];

        const duration = calculateDuration(startTime, endTime);

        if (!results[acNo]) {
          results[acNo] = {
            totalDuration: 0,
            count: 0,
            Name: attendance["Name"],
            absenceCount: 0,
          };
        }

        results[acNo].totalDuration += duration;
        results[acNo].count++;
      }
    }

    let data = [];

    for (let acNo in results) {
      let averageDuration = results[acNo].totalDuration / results[acNo].count;
      let roundedDuration = Math.round(averageDuration);
      let hours = Math.floor(roundedDuration / 60);
      let minutes = roundedDuration % 60;
      let timeLabel = `${String(hours).padStart(2, "0") + "h"}:${
        String(minutes).padStart(2, "0") + "m"
      }`;

      data.push({
        acNo: acNo,
        timeValue: roundedDuration,
        timeLabel: timeLabel,
        Name: results[acNo].Name,
        Absent: `${results[acNo].absenceCount} ${
          results[acNo].absenceCount === 1 ? "day" : "days"
        }`,
      });
    }

    await client.setEx(
      cacheKey,
      CACHE_EXPIRATION_SECONDS,
      JSON.stringify(data)
    );

    console.log("data : ", data);
    res.status(201).json(data);
  } catch (err) {
    console.error("Error processing attendance:", err);
    res
      .status(500)
      .json({ error: "An error occurred while processing attendance" });
  }
}
