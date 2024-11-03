import prisma from "../config/db.js";






export const create=async(req,res)=>{
    const {mealId,mealDetails}=req.body;
//console.log(mealDetails);
    try{
   const mealDetail=await prisma.MealDetail.create({
    
    data:{
        mealId:mealId,
        mealName:mealDetails.mealName||' ',
        price:mealDetails.price||0,
        quantity:mealDetails.quantity||1
    }
   });

   res.status(201).json({message:"Meal created successfully",data:{mealDetail}});

    }catch(error){
        console.log("err while creating new mealDetail",error);
        res.status(500).json({ message: 'Internal server error', error: error.message });

    }
}



export const update = async (req, res) => {
    const { mealId, mealDetails } = req.body;
console.log(mealDetails);
    try {
        // Check if the meal details already exist
        const result = await prisma.MealDetail.findUnique({
            where: {
                id: mealDetails.id,  // Assuming mealDetails has an 'id' field
            },
        });

        if (result) {
            // If meal detail exists, update it
            const updated = await prisma.MealDetail.update({
                where: {
                    id: mealDetails.id,  // Use the correct ID to update
                },
                data: {
                    ...mealDetails,  
                    total:(mealDetails.price*mealDetails.quantity)||0,
                    // Spread the updated details
                },
            });
            const sumOfMealDetailForThisMeal = await prisma.mealDetail.aggregate({
                where: {
                    mealId: mealId, // filter by the specific mealId
                },
                _sum: {
                    total: true, // sum the `total` field
                },
            });
            
            // Extract the summed total from the result
            const totalSum = sumOfMealDetailForThisMeal._sum.total || 0;
            console.log("Sum of total for mealId:", mealId, totalSum);
            const updatedMeal=await prisma.Meal.update({
                where:{
                    id:mealId
                },
                data:{
                    cost:totalSum
                }
              })
              console.log(updatedMeal)
            return res.status(200).json({ message: 'Meal details updated successfully', updatedMeal });
       
        } else {
            // If meal detail does not exist, create a new entry
            const created = await prisma.MealDetail.create({
                data: {
                    ...mealDetails, 
                    total:(mealDetails.price*mealDetails.quantity)||0,
                     // Spread the new meal details for creation
                },
            });

            const sumOfMealDetailForThisMeal = await prisma.mealDetail.aggregate({
                where: {
                  mealId: mealId, // filter by the specific mealId
                },
                _sum: {
                  total: true, // sum the `total` field
                },
              });
              
              // Extract the summed total from the result
              const totalSum = sumOfMealDetailForThisMeal._sum.total || 0;
              console.log("Sum of total for mealId:", mealId, totalSum);
              const updatedMeal=await prisma.Meal.update({
                where:{
                    id:mealId
                },
                data:{
                    cost:totalSum
                }
              })
              console.log(updatedMeal)
            return res.status(201).json({ message: 'Meal details created successfully', updatedMeal });
        }
        
    } catch (error) {
        // Handle errors
        console.error(error);
        return res.status(500).json({ message: 'An error occurred while processing meal details', error });
    }
};
