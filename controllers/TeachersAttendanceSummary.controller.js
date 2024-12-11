import { GoogleSpreadsheet } from "google-spreadsheet";

import serviceAccountAuth from "../helpers/authService.js";

import client from "../helpers/redisClient.js";
import extractData from "../helpers/extractData.js";
import { differenceInMinutes, parse } from "date-fns";

const CACHE_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 1 day

export async function TeachersAttendanceSummary(req, res) {
  const { attendanceSheet, attendanceWorkSheet } = req.query;

  if (!attendanceSheet) {
    return res
      .status(400)
      .json({ error: "Sheet IDs for attendance are required" });
  }

  const cacheKey = `TeachersAttendanceSummary:${attendanceSheet}:${attendanceWorkSheet}`;

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

    let results = {};

    // Process all records for each AC-No
    for (let attendance of staffAttendance) {
      const acNo = attendance["AC-No"];

      if (!results[acNo]) {
        results[acNo] = {
          presentCount: 0,
          absenceCount: 0,
          Name: attendance["Name"],
        };
      }

      if (attendance["Time"].length === 0) {
        const dateStr = attendance["Date"];
        const date = parse(dateStr, "MM/dd/yyyy", new Date());
        const dayOfWeek = date.getDay();

        if (dayOfWeek !== 0) {
          results[acNo].absenceCount++;
        }
      } else {
        results[acNo].presentCount++;
      }
    }

    let data = [];

    for (let acNo in results) {
      data.push({
        acNo: acNo,
        Name: results[acNo].Name,
        Present: `${results[acNo].presentCount} ${
          results[acNo].presentCount === 1 ? "day" : "days"
        }`,
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
