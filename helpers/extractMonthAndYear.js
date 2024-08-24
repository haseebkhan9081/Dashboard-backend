const extractMonthAndYear = (title) => {
    const [month, year] = title.split(' ');
    return { month: month.toLowerCase(), year: parseInt(year, 10) };
  };
  export default extractMonthAndYear;