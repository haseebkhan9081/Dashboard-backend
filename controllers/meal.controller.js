import prisma from "../config/db.js";

export const update = async (req, res) => {
    const { mealId,updatedMeal } = req.body;

    try {
        const updated = await prisma.Meal.update({
            where: {
                id: mealId
            },
            data: {
                noOfBoxes:updatedMeal.noOfBoxes,
                paidStatus:updatedMeal.paidStatus,
            }
        });

        console.log("Updated Meal:", updated);
        
        // Send a successful response with the updated meal
        return res.status(200).json({
            success: true,
            message: 'Meal updated successfully',
            data: updated
        });
    } catch (error) {
        console.error("Error updating meal:", error);

        // Send an error response
        return res.status(500).json({
            success: false,
            message: 'Error updating meal',
            error: error.message // Optionally, return the error message
        });
    }
};
