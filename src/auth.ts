import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import "dotenv/config";


const connectionString = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!connectionString) {
  throw new Error("MONGO_URI or MONGODB_URI is not defined in environment variables");
}

const client = new MongoClient(connectionString);
const db = client.db();

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
    transaction: false, // set to false for local standalone MongoDB servers
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  trustedOrigins: [
    "http://localhost:3000",
    "https://neighbor-notes-client-eta.vercel.app",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
      path: "/",
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "resident",
        input: false,
      },
      buildingId: {
        type: "string",
        required: false,
        input: true,
      },
      floor: {
        type: "string",
        required: false,
        input: true,
      },
      flat: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
});
export type Auth = typeof auth;
