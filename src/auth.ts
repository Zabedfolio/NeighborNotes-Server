import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

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
