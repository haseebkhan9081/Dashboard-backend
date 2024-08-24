import extractMonthAndYear from "./extractMonthAndYear.js";

const sortSheetTitles = (titles) => {
  const sortedTitles = titles.sort((a, b) => {
    const dateA = new Date(`${extractMonthAndYear(a).month} 1, ${extractMonthAndYear(a).year}`);
    const dateB = new Date(`${extractMonthAndYear(b).month} 1, ${extractMonthAndYear(b).year}`);
    return dateB - dateA;
  });

  return sortedTitles;
};

export default sortSheetTitles;
