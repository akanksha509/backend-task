// src/index.ts

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { identify } from "./controllers/identify.controller";

dotenv.config();

const app = express();

// Determine environment
const isProduction = process.env.NODE_ENV === "production";

// Enhanced rate limiter
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,             // 15 minutes
  max: isProduction ? 100 : 1000,       // tighter in prod
  standardHeaders: true,                // return rate limit info in headers
  legacyHeaders: false,                 // disable X-RateLimit-* headers
  message: "Too many requests, please try again later."
});

app.use(rateLimiter);
app.use(express.json());
app.use(helmet());

// Configure Prisma with logging in development
const prisma = new PrismaClient({
  log: isProduction ? ["error"] : ["query", "info", "warn", "error"],
});

// Health check endpoint
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      status: "error",
      error: "Database connection failed",
    });
  }
});

// Identify route
app.post("/identify", identify);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 3000;

  // Start server and capture the instance for graceful shutdown
  const server = app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });

  // Graceful shutdown on SIGTERM and SIGINT
  const shutdown = (signal: string) => {
    console.log(`${signal} received – closing server`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log("Database disconnected, server closed");
        process.exit(0);
      } catch (err) {
        console.error("Error during shutdown:", err);
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;



