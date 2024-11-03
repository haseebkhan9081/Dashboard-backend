import prisma from "../config/db.js";



const result =await prisma.organization.findMany();



console.log(result);