import { Request } from "express";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateIdentifyRequest = (req: Request): string | null => {
  const { email, phoneNumber } = req.body ?? {};  

  // require at least one identifier
  if (!email && !phoneNumber) return "Either email or phoneNumber is required";

  // validate email when present
  if (email !== undefined) {
    if (typeof email !== "string") return "email must be a string";
    const trimmed = email.trim();                   
    if (!trimmed) return "email cannot be empty";
    if (!emailRegex.test(trimmed)) return "email is not a valid address";
  }

  // validate phone when present
  if (phoneNumber !== undefined) {
    const pnString = phoneNumber.toString().trim(); 
    if (!pnString) return "phoneNumber cannot be empty";
    if (!/\d/.test(pnString)) return "phoneNumber must contain at least one digit";
  }

  return null;  
};


