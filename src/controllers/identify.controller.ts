import { RequestHandler } from "express";
import { validateIdentifyRequest } from "../utils/validation";
import { processContact } from "../services/identify.service";
import { ValidationError, DatabaseError } from "../utils/errors";

export const identify: RequestHandler = async (req, res, next) => {
  // Log the incoming request payload for audit and debugging purposes
  console.log("identify payload:", JSON.stringify(req.body));

  try {
    // Validate that either email or phoneNumber is provided and correctly formatted
    const error = validateIdentifyRequest(req);
    if (error) {
      console.warn("validation failed:", error);
      throw new ValidationError(error);
    }

    // Extract email and phoneNumber from request, defaulting to null if absent
    const { email = null, phoneNumber = null } = req.body;

    // Execute core business logic to create or reconcile contact records
    const contact = await processContact(
      email,
      phoneNumber?.toString() ?? null
    );

    // Log the result of the reconciliation and return it to the client
    console.log("identify result:", contact);
    res.json({ contact });
  } catch (err: any) {
    // Log any errors encountered during processing
    console.error("identify error:", err);

    if (err instanceof ValidationError) {
      // Respond with HTTP 400 for client-side validation errors
      res.status(400).json({ error: err.message });
    } else if (err instanceof DatabaseError) {
      // Respond with HTTP 503 for database-related issues
      res.status(503).json({ error: "Service unavailable" });
    } else {
      // Delegate all other exceptions to the global error handler
      next(err);
    }
  }
};





