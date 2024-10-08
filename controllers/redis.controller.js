import client from "../helpers/redisClient.js";
// Clear all Redis databases
async function clearAllCache() {
    try {
        // Clear all Redis databases (Use capital "A" in flushAll for Redis v4+)
        const result = await client.flushAll();
        console.log('All Redis databases cleared:', result);
    } catch (err) {
        console.error('Error clearing Redis cache:', err);
    } finally {
        // Close the Redis connection
    }
}


export const CleanRedis=async(req,res)=>{
    try {
        await clearAllCache();
        res.status(200).json({ message: 'Redis cache cleared successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to clear Redis cache', error: error.message });
    }
}

