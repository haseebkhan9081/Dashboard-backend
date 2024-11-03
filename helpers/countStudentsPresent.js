import { isValid, parse } from "date-fns";

const countStudentsPresent = (data) => {
  if(data==undefined){
    return 0
  }
    return data.reduce((acc, attendance) => {
      const date = attendance.Date;
      const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
      if (attendance.Time && attendance.Time.length > 0 && isValid(parsedDate)) {
        const formattedDate = parsedDate.toISOString().split('T')[0]; // Normalize date to YYYY-MM-DD
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date]++;
      }
      return acc;
    }, {});
  };

  export default countStudentsPresent;