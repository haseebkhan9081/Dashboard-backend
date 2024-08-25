 // redisClient.js
 import { createClient } from 'redis';
 import dotenv from 'dotenv';
 dotenv.config();
 const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD
    });

    client.on('error', (err) => {
    console.error('Redis error:', err);
    });

    client.connect().then(() => {
    console.log('Connected to Redis');
    });
export default client;
