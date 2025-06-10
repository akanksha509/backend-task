// src/services/identify.service.ts

import { Prisma, PrismaClient, Contact } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "../utils/normalization";
import { DatabaseError } from "../utils/errors";

const prisma = new PrismaClient();

/**
 * Fetch the full cluster (primary + all secondaries) for a given primary ID.
 */
async function fetchContactCluster(primaryId: number): Promise<Contact[]> {
  return prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: primaryId },
        { linkedId: primaryId },
      ],
    },
  });
}

export async function processContact(
  rawEmail: string | null,
  rawPhone: string | null,
  maxRetries = 3
): Promise<{
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}> {
  const email = normalizeEmail(rawEmail);
  const phone = normalizePhone(rawPhone);

  if (!email && !phone) {
    throw new Error("email or phoneNumber required");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Find any contacts matching email OR phone
        const matches = await tx.contact.findMany({
          where: {
            deletedAt: null,
            OR: [
              email && { email: { equals: email } },
              phone && { phoneNumber: { equals: phone } },
            ].filter(Boolean) as Prisma.ContactWhereInput[],
          },
        });

        // 2. If none exist, create a new primary
        if (matches.length === 0) {
          const primary = await tx.contact.create({
            data: { email, phoneNumber: phone, linkPrecedence: "primary" },
          });
          return buildResponse(primary.id, [primary]);
        }

        // 3. Determine the "true" primary IDs for all matches
        const candidatePrimaryIds = matches.map((m) =>
          m.linkPrecedence === "secondary" && m.linkedId
            ? m.linkedId
            : m.id
        ) as number[];
        const uniquePrimaryIds = Array.from(new Set(candidatePrimaryIds));

        // 4. Fetch potential primaries & pick the oldest
        const primaryRecords = await tx.contact.findMany({
          where: { id: { in: uniquePrimaryIds } },
          orderBy: { createdAt: "asc" },
        });
        const primary = primaryRecords[0];
        const otherPrimaries = primaryRecords.slice(1);

        // 5. Merge other primaries into the oldest
        if (otherPrimaries.length) {
          const otherPrimaryIds = otherPrimaries.map((p) => p.id);

          // 5a) Re-link any children of soon-to-be-demoted primaries
          await tx.contact.updateMany({
            where: { linkedId: { in: otherPrimaryIds } },
            data: { linkedId: primary.id, updatedAt: new Date() },
          });

          // 5b) Demote those primaries to secondary, and point them at the true primary
          await tx.contact.updateMany({
            where: { id: { in: otherPrimaryIds } },
            data: {
              linkPrecedence: "secondary",
              linkedId: primary.id,
              updatedAt: new Date(),
            },
          });
        }

        // 6. Fetch full cluster (primary + any secondaries)
        const rootIds = [primary.id, ...otherPrimaries.map((p) => p.id)];
        const cluster = await tx.contact.findMany({
          where: {
            deletedAt: null,
            OR: [
              { id: { in: rootIds } },
              { linkedId: { in: rootIds } },
            ],
          },
        });

        // === NEW: force a secondary for email-only or phone-only duplicates ===
        if (email && !phone) {
          const sec = await tx.contact.create({
            data: {
              email,
              phoneNumber: null,
              linkPrecedence: "secondary",
              linkedId: primary.id,
            },
          });
          cluster.push(sec);
          return buildResponse(primary.id, cluster);
        }
        if (phone && !email) {
          const sec = await tx.contact.create({
            data: {
              email: null,
              phoneNumber: phone,
              linkPrecedence: "secondary",
              linkedId: primary.id,
            },
          });
          cluster.push(sec);
          return buildResponse(primary.id, cluster);
        }
        // ================================================================

        // 7. “Both fields present” path: only create if truly new info
        const hasEmail = email && cluster.some((c) => c.email === email);
        const hasPhone = phone && cluster.some((c) => c.phoneNumber === phone);
        const needEmailLink = !!(email && !hasEmail);
        const needPhoneLink = !!(phone && !hasPhone);

        if (needEmailLink || needPhoneLink) {
          const sec = await tx.contact.create({
            data: {
              email: needEmailLink ? email : null,
              phoneNumber: needPhoneLink ? phone : null,
              linkPrecedence: "secondary",
              linkedId: primary.id,
            },
          });
          cluster.push(sec);
        }

        // 8. Build and return the consolidated response
        return buildResponse(primary.id, cluster);
      },
      {
        maxWait: 5_000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (e: any) {
    // retry on unique-constraint violation (race)
    if (e.code === "P2002" && maxRetries > 0) {
      try {
        // find the conflicting row by matching email+phone OR either alone
        const existing = await prisma.contact.findFirst({
          where: {
            deletedAt: null,
            OR: [
              email && phone ? { email, phoneNumber: phone } : undefined,
              email ? { email } : undefined,
              phone ? { phoneNumber: phone } : undefined,
            ].filter(Boolean) as Prisma.ContactWhereInput[],
          },
          orderBy: { createdAt: "asc" },
        });

        if (existing) {
          const truePrimaryId =
            existing.linkPrecedence === "primary"
              ? existing.id
              : existing.linkedId!;
          const cluster = await fetchContactCluster(truePrimaryId);
          return buildResponse(truePrimaryId, cluster);
        }
      } catch {
        // ignore and retry
      }

      return processContact(rawEmail, rawPhone, maxRetries - 1);
    }

    if (e.code === "P2002") {
      throw new DatabaseError("Failed to resolve contact conflict");
    }

    throw e;
  }
}

function buildResponse(primaryId: number, chain: Contact[]) {
  const primary = chain.find((c) => c.id === primaryId)!;
  const secondaries = chain.filter((c) => c.id !== primaryId);

  const emails = Array.from(
    new Set(
      [primary.email, ...secondaries.map((c) => c.email)].filter(
        (e): e is string => !!e
      )
    )
  );
  const phoneNumbers = Array.from(
    new Set(
      [primary.phoneNumber, ...secondaries.map((c) => c.phoneNumber)].filter(
        (p): p is string => !!p
      )
    )
  );

  return {
    primaryContactId: primaryId,
    emails,
    phoneNumbers,
    secondaryContactIds: secondaries.map((c) => c.id),
  };
}
