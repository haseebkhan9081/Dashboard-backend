import { eachDayOfInterval, format, lastDayOfMonth } from 'date-fns';
import prisma from '../config/db.js';
// Function to generate dates and days for a given month and year
function getDatesInMonth(year, month) {
  const startDate = new Date(year, month, 1);
  const endDate = lastDayOfMonth(startDate);

  const dates = eachDayOfInterval({ start: startDate, end: endDate });

  return dates.map((date) => ({
    date: format(date, 'yyyy-MM-dd'), // Use ISO format for database compatibility
    day: format(date, 'EEEE'), // Get the full day name (e.g., Monday, Tuesday)
  }));
}

// Function to create a new meal sheet in the database
export const addNewMealSheet = async (req, res) => {
  const { month, year, organizationId } = req.body;

  try {
    // Generate dates and days for the specified month and year
    const datesInMonth = getDatesInMonth(year, month);
    console.log(datesInMonth.length);
    // Check if there are any existing entries for the specified month and year
    const existingEntries = await prisma.meal.findMany({
      where: {
        date: {
          gte: new Date(datesInMonth[0].date),
          lte: new Date(datesInMonth[datesInMonth.length-1].date), // Last day of the month
        },
        organizationId: organizationId,
      },
    });

    if (existingEntries.length > 0) {
      return res.status(400).json({ message: `Meal sheet for ${month + 1}/${year} already exists.` ,data:existingEntries});
    }

    // If no existing entries are found, create new meal entries
    const newMeals = datesInMonth.map(({ date, day }) => ({
      date: new Date(date),
      day: day,
      mealName: null,
      noOfBoxes: 0,
      cost: 0,
      paidStatus: 'UnPaid',
      organizationId: organizationId,
    }));

    // Bulk insert new meal entries into the database
    await prisma.meal.createMany({
      data: newMeals,
    });

    return res.status(201).json({ message: 'Meal sheet created successfully', data: newMeals });
  } catch (error) {
    console.error('Error creating meal sheet:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};


export const getMealSheet=async(req,res)=>{
  const { month, year, organizationId } = req.body;
  try {
    // Generate dates and days for the specified month and year
    const datesInMonth = getDatesInMonth(year, month);
    console.log(datesInMonth.length);
    // Check if there are any existing entries for the specified month and year
    const existingEntries = await prisma.meal.findMany({
      where: {
        date: {
          gte: new Date(datesInMonth[0].date),
          lte: new Date(datesInMonth[datesInMonth.length-1].date), // Last day of the month
        },
        organizationId: organizationId,
      },
      include:{
        mealDetails:true
      }
    });

    if (existingEntries.length > 0) {
      return res.status(201).json({ message: `Meal sheet for ${month + 1}/${year} exists.` ,data:existingEntries});
    }

    // If no existing entries are found, create new meal entries
    const newMeals = datesInMonth.map(({ date, day }) => ({
      date: new Date(date),
      day: day,
      mealName: null,
      noOfBoxes: 0,
      cost:0,
      paidStatus: "UnPaid",
      organizationId: organizationId,
    }));

    // Bulk insert new meal entries into the database
    await prisma.meal.createMany({
      data: newMeals,
    });

    return res.status(201).json({ message: 'Meal sheet created successfully', data: newMeals });
  } catch (error) {
    console.error('Error creating meal sheet:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
  
}



import { getMonth, getYear } from 'date-fns';

export const getUniqueMonthYearPairs=async(req,res) =>{
  const monthsAndYears = await prisma.meal.findMany({
    distinct: ['date'],
    select: {
      date: true,
    },
  });

  const uniqueMonthYearPairs = [
    ...new Set(
      monthsAndYears.map((meal) => {
        const date = new Date(meal.date);
        const month = getMonth(date) + 1; // getMonth() is zero-indexed, so add 1
        const year = getYear(date);
        const label = format(date, 'MMMM yyyy'); // Full month name and year
         const value=label;
        return JSON.stringify({ month, year, label,value }); // Stringify to maintain uniqueness in Set
      })
    ),
  ].map((monthYear) => JSON.parse(monthYear)); // Parse back to objects

  return res.status(201).json({message:"found pairs successfully",data:uniqueMonthYearPairs});
}

