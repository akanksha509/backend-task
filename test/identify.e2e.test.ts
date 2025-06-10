import request from "supertest";
import { PrismaClient } from "@prisma/client";
import app from "../src/index";

const prisma = new PrismaClient();

describe("/identify flow", () => {
  beforeAll(async () => {
    await prisma.contact.deleteMany(); // clear table before suite
  });

  afterAll(async () => {
    await prisma.$disconnect();       // close DB connection
  });

  it("creates a new primary contact", async () => {
    // send first contact, expect primary with no secondaries
    const res = await request(app)
      .post("/identify")
      .send({ email: "lorraine@hillvalley.edu", phoneNumber: "123456" })
      .expect(200);

    expect(res.body.contact.primaryContactId).toBeDefined();  
    expect(res.body.contact.emails).toContain("lorraine@hillvalley.edu");  
    expect(res.body.contact.phoneNumbers).toContain("123456");  
    expect(res.body.contact.secondaryContactIds).toEqual([]);  
  });

  it("creates secondary contact for existing primary", async () => {
    // create base primary
    await request(app)
      .post("/identify")
      .send({ email: "george@hillvalley.edu", phoneNumber: "919191" });

    // reuse phone to force secondary creation
    const res = await request(app)
      .post("/identify")
      .send({ email: "biffsucks@hillvalley.edu", phoneNumber: "919191" })
      .expect(200);

    expect(res.body.contact.secondaryContactIds.length).toBeGreaterThan(0);
    expect(res.body.contact.emails).toEqual(
      expect.arrayContaining([
        "george@hillvalley.edu",
        "biffsucks@hillvalley.edu",
      ])
    );
  });
});

describe("Advanced scenarios", () => {
  beforeEach(async () => {
    await prisma.contact.deleteMany(); // reset for each test
  });

  it("handles primary-to-secondary conversion", async () => {
    // create two independent primaries
    await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "919191",
    });
    await request(app).post("/identify").send({
      email: "biffsucks@hillvalley.edu",
      phoneNumber: "717171",
    });

    // link them by overlapping identifiers
    const res = await request(app).post("/identify").send({
      email: "george@hillvalley.edu",
      phoneNumber: "717171",
    }).expect(200);

    expect(res.body.contact.primaryContactId).toBeDefined();
    expect(res.body.contact.emails).toEqual(
      expect.arrayContaining([
        "george@hillvalley.edu",
        "biffsucks@hillvalley.edu",
      ])
    );
    expect(res.body.contact.phoneNumbers).toEqual(
      expect.arrayContaining(["919191", "717171"])
    );
    expect(res.body.contact.secondaryContactIds.length).toBe(1);
  });

  it("merges multiple contact clusters", async () => {
    // build three overlapping clusters
    await request(app).post("/identify").send({ email: "email1@test.com", phoneNumber: "111111" });
    await request(app).post("/identify").send({ email: "email1@test.com", phoneNumber: "222222" });
    await request(app).post("/identify").send({ email: "email2@test.com", phoneNumber: "111111" });

    // final link to unify all three
    const res = await request(app).post("/identify").send({
      email: "email2@test.com",
      phoneNumber: "222222",
    }).expect(200);

    expect(res.body.contact.emails).toEqual(
      expect.arrayContaining(["email1@test.com", "email2@test.com"])
    );
    expect(res.body.contact.phoneNumbers).toEqual(
      expect.arrayContaining(["111111", "222222"])
    );
    expect(res.body.contact.secondaryContactIds.length).toBe(2);
  });

  it("handles null/empty values", async () => {
    // email-only case
    const res1 = await request(app)
      .post("/identify")
      .send({ email: "only-email@test.com" })
      .expect(200);
    expect(res1.body.contact.emails).toContain("only-email@test.com");
    expect(res1.body.contact.phoneNumbers).toEqual([]);

    // phone-only case
    const res2 = await request(app)
      .post("/identify")
      .send({ phoneNumber: "333333" })
      .expect(200);
    expect(res2.body.contact.phoneNumbers).toContain("333333");
    expect(res2.body.contact.emails).toEqual([]);

    // missing both → should 400
    await request(app)
      .post("/identify")
      .send({})
      .expect(400);
  });

  it("handles duplicate requests", async () => {
    const payload = { email: "duplicate@test.com", phoneNumber: "444444" };
    await request(app).post("/identify").send(payload).expect(200);
    // second identical request shouldn't create a secondary
    const res = await request(app).post("/identify").send(payload).expect(200);
    expect(res.body.contact.secondaryContactIds).toEqual([]);
  });

  it("maintains primary contact as oldest", async () => {
    // create old then new with same phone
    await request(app).post("/identify").send({ email: "old@test.com", phoneNumber: "555555" });
    await new Promise((r) => setTimeout(r, 100));
    await request(app).post("/identify").send({ email: "new@test.com", phoneNumber: "555555" });

    // querying by phone should show 'old' first
    const res = await request(app).post("/identify").send({ phoneNumber: "555555" }).expect(200);
    expect(res.body.contact.emails[0]).toBe("old@test.com");
  });

  it("handles international phone numbers", async () => {
    // plus-format input should normalize
    const res = await request(app).post("/identify").send({
      email: "international@test.com",
      phoneNumber: "+44 20 7123 4567",
    }).expect(200);

    expect(res.body.contact.phoneNumbers[0]).toBe("442071234567");
  });
});

describe("Extra edge-case tests", () => {
  beforeEach(async () => {
    await prisma.contact.deleteMany(); // fresh start each
  });

  it("handles concurrent creation requests", async () => {
    const payload = { email: "race@test.com", phoneNumber: "555555" };
    // fire two in parallel
    const [res1, res2] = await Promise.all([
      request(app).post("/identify").send(payload),
      request(app).post("/identify").send(payload)
    ]);

    // both should succeed and share same primary
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.contact.primaryContactId).toEqual(res2.body.contact.primaryContactId);
  });

  it("links different phone formats", async () => {
    await request(app).post("/identify").send({
      email: "format@test.com",
      phoneNumber: "+1 (987) 654-3210"
    });

    // matching stripped input should hit existing cluster
    const res = await request(app).post("/identify").send({
      phoneNumber: "19876543210"
    }).expect(200);

    expect(res.body.contact.phoneNumbers).toEqual(["19876543210"]);
  });

  it("merges email-only duplicates when adding a phone", async () => {
    const email = "dup@test.com";
    // build two email-only primaries
    await request(app).post("/identify").send({ email });
    await request(app).post("/identify").send({ email });

    // add phone to unify them
    const res = await request(app).post("/identify").send({ email, phoneNumber: "123456" }).expect(200);

    // expect two secondaries after demotion
    expect(res.body.contact.secondaryContactIds.length).toBe(2);
  });
});
