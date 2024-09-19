import { isValid, parse } from "date-fns";

const SumStudentsFromAllDepartments=(data)=>{
    return data.reduce((acc,attendance)=>{
     
      const date=attendance.Date;
      const parsedDate=parse(date,'MM/dd/yyyy', new Date())
      
      if(isValid(parsedDate)){
      
         
if(!acc[date]){
acc[date]=Number(0);
}
acc[date]+=Number(attendance.Present);
      } 
      return acc;
    },{});
      }

      export default SumStudentsFromAllDepartments;