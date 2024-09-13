import { isValid, parse } from "date-fns";

const SumStudentsFromAllDepartments=(data)=>{
    return data.reduce((acc,attendance)=>{
      console.log("this is in the accumulator",attendance.Date)
      const date=attendance.Date;
      const parsedDate=parse(date,'MM/dd/yyyy', new Date())
     console.log("parsedDate ",parsedDate)
      if(isValid(parsedDate)){
      console.log("yep it is valid")
        const formattedDate = parsedDate.toISOString().split('T')[0]; // Normalize date to YYYY-MM-DD
if(!acc[date]){
acc[date]=Number(0);
}
acc[date]+=Number(attendance.Present);
      }
      return acc;
    },{});
      }

      export default SumStudentsFromAllDepartments;