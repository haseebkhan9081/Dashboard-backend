import app from "./app.js";
import dotenv from "dotenv";
import { prisma } from "./src/db/index.js"

dotenv.config({
  path: '.env'
});
app.get("/", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI-Apparel</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: linear-gradient(to right, #6a11cb, #2575fc); /* Purple and Sky Blue Gradient */
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          color: #fff;
        }
        .container {
          background: rgba(255, 255, 255, 0.9); /* Slightly transparent white */
          padding: 30px 50px;
          border-radius: 15px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          text-align: center;
        }
        h1 {
          color: #ff69b4; /* Pink */
          margin-bottom: 20px;
        }
        p {
          font-size: 1.2em;
          line-height: 1.6em;
          color: #333;
        }
        .footer {
          margin-top: 20px;
          font-size: 0.9em;
          color: #777;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome to AI-Apparel</h1>
        <p>This is an example HTML response from the backend.</p>
        <div class="footer">© 2024 AI-Apparel. All rights reserved.</div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

const port = process.env.PORT || 3000;


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});