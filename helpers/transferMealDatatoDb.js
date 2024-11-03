import xlsx from "xlsx"
import prisma from "../config/db.js";
import { parse, isValid } from 'date-fns'
// File path for the meal data Excel sheet
const mealFile = './Library of Ibrahim Goth Quotation Per Meal.xlsx';

// Helper function to parse Excel sheet
const parseExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[1];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

// Function to import Meal Data
async function importMealData() {
  const data = parseExcel(mealFile);

  for (const record of data) {
    
    const {
      Date: date,
      Day: day,
      'Meal Name': mealName,
      'No. Of Boxes': noOfBoxes,
      'Cost for Meals': costFor200,
      'Paid / Not Paid': paidStatus
    } = record;
console.log("record here",record);
    // Find the organization by name (you can modify this if you have dynamic organization handling)
    const organization = await prisma.organization.findFirst({
      where: { name: 'Library of Ibrahim Goth' }, // Change this to the actual organization name
    });

    if (!organization) {
      console.error('Organization not found.');
      continue;
    }
    const parsedDate = parse(date, 'M/d/yyyy', new Date());  // Adjust format as necessary

    if (!isValid(parsedDate)) {
      console.error(`Invalid date: ${date}. Skipping this record.`);
      continue; // Skip to the next record if the date is invalid
    }

    // Format date back to M/d/yyyy if needed (this is optional)
    const formattedDate = format(parsedDate, 'M/d/yyyy');
    // Create a meal record in the database
    await prisma.meal.upsert({
        where: {
            date: formattedDate,
        },
        update: {
          // Update these fields if the meal record already exists
          noOfBoxes: parseInt(noOfBoxes) || 0,
          costFor200: parseFloat(costFor200) || 0,
          paidStatus: paidStatus || null,
        },
        create: {
          // Create a new meal record if no existing record matches the `where` condition
          date:formattedDate,
          day,
          mealName: mealName || null, // Handle missing meal names
          noOfBoxes: parseInt(noOfBoxes) || 0,
          costFor200: parseFloat(costFor200) || 0,
          paidStatus: paidStatus || null,
          organization: {
            connect: { id: organization.id },
          },
        },
      });
      

    console.log(`Inserted meal record for date ${formattedDate}`);
  }
}

// Main function to run the import
async function main() {
  try {
    console.log('Starting meal data import...');

    await importMealData();

    console.log('Meal data import complete.');
  } catch (error) {
    console.error('Error during meal data import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the meal data import script
main();
