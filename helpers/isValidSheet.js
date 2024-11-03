import {parse,isValid} from "date-fns"
import cleanTitle from "./cleanTitle.js";


export const isValidsheet=(name)=>{
    const parsedDate=parse(cleanTitle(name),"MMMM yyyy",new Date());
    return isValid(parsedDate)
}

