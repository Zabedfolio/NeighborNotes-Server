import mongoose, { model, Schema } from "mongoose";
import { auth } from "./auth.js";
import "dotenv/config";


const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/neighbornotes";

// Import schemas directly to clear and insert
const buildingSchema = new Schema({
  name: String,
  areaCode: String,
  address: String,
  ownerId: String,
  plan: String,
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  createdAt: { type: Date, default: Date.now },
});

const inviteSchema = new Schema({
  email: String,
  buildingId: String,
  status: String,
  invitedAt: { type: Date, default: Date.now },
  claimedAt: Date,
});

const noticeSchema = new Schema({
  buildingId: String,
  authorId: String,
  title: String,
  description: String,
  category: String,
  imageUrl: String,
  isPinned: { type: Boolean, default: false },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
});

const commentSchema = new Schema({
  noticeId: String,
  authorId: String,
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const reactionSchema = new Schema({
  noticeId: String,
  userId: String,
  type: String,
  createdAt: { type: Date, default: Date.now },
});

const Building = mongoose.models.Building || model("Building", buildingSchema);
const Invite = mongoose.models.Invite || model("Invite", inviteSchema);
const Notice = mongoose.models.Notice || model("Notice", noticeSchema);
const Comment = mongoose.models.Comment || model("Comment", commentSchema);
const Reaction = mongoose.models.Reaction || model("Reaction", reactionSchema);

async function runSeed() {
  console.log("Connecting to MongoDB for seeding...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected successfully.");

  // 1. Clean database collections
  console.log("Clearing existing collections...");
  await mongoose.connection.db?.collection("user").deleteMany({});
  await mongoose.connection.db?.collection("session").deleteMany({});
  await mongoose.connection.db?.collection("account").deleteMany({});
  await mongoose.connection.db?.collection("verification").deleteMany({});
  await Building.deleteMany({});
  await Invite.deleteMany({});
  await Notice.deleteMany({});
  await Comment.deleteMany({});
  await Reaction.deleteMany({});
  console.log("Database cleared.");

  // 2. Create Building
  console.log("Creating building...");
  const building = await Building.create({
    name: "Gulshan Crest Heights",
    areaCode: "DHK-GLS-8822",
    address: "Road 12, Gulshan-2, Dhaka",
    ownerId: "placeholder", // will update after owner user is created
    plan: "free",
  });
  console.log(`Building created: ${building.name} (Code: ${building.areaCode})`);

  // 3. Create Owner User
  console.log("Creating owner user...");
  const ownerUser = await auth.api.signUpEmail({
    body: {
      email: "owner@demo.com",
      password: "password123",
      name: "Chowdhury Rahman",
      buildingId: building._id.toString(),
    },
  });

  if (!ownerUser) {
    throw new Error("Failed to create owner user.");
  }

  // Update building ownerId and user role in DB
  building.ownerId = ownerUser.user.id;
  await building.save();
  await mongoose.connection.db?.collection("user").updateOne(
    { _id: new mongoose.Types.ObjectId(ownerUser.user.id) as any },
    { $set: { role: "owner" } }
  );
  console.log(`Owner created: ${ownerUser.user.name} (${ownerUser.user.email})`);

  // 4. Create Resident User
  console.log("Creating resident user...");
  const residentUser = await auth.api.signUpEmail({
    body: {
      email: "resident@demo.com",
      password: "password123",
      name: "Sajjad Hossain",
      buildingId: building._id.toString(),
    },
  });

  if (!residentUser) {
    throw new Error("Failed to create resident user.");
  }
  console.log(`Resident created: ${residentUser.user.name} (${residentUser.user.email})`);

  // 5. Create Invites
  console.log("Creating resident invites...");
  // Claimed invite for resident
  await Invite.create({
    email: "resident@demo.com",
    buildingId: building._id.toString(),
    status: "claimed",
    invitedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    claimedAt: new Date(),
  });

  // Pending invite for another user
  await Invite.create({
    email: "pending@demo.com",
    buildingId: building._id.toString(),
    status: "pending",
    invitedAt: new Date(),
  });
  console.log("Invites seeded.");

  // 6. Create Notices
  console.log("Creating notice board posts...");
  
  // Notice 1: Pinned emergency notice
  const notice1 = await Notice.create({
    buildingId: building._id.toString(),
    authorId: ownerUser.user.id,
    title: "Urgent Generator Maintenance Schedule",
    description: "Please note that the main building generator will undergo scheduled servicing this Friday (July 17) from 10:00 AM to 2:00 PM. Power backups in elevators and common areas will be unavailable during this period. We apologize for the inconvenience.",
    category: "Emergency",
    isPinned: true,
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // expires in 5 days
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // posted 1 day ago
  });

  // Notice 2: Active maintenance notice
  const notice2 = await Notice.create({
    buildingId: building._id.toString(),
    authorId: residentUser.user.id,
    title: "Elevator-2 Fan Issue reported",
    description: "The ceiling fan in Elevator-2 is making a loud clicking noise and not blowing sufficient air. Reported to the guard desk, building management please look into this on priority.",
    category: "Maintenance",
    isPinned: false,
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // expires in 3 days
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // posted 12 hours ago
  });

  // Notice 3: Expired notice (should appear under archived)
  await Notice.create({
    buildingId: building._id.toString(),
    authorId: ownerUser.user.id,
    title: "Rooftop Garden Sprinkler Installation",
    description: "Contractors will be working on the rooftop to install automated garden sprinklers. Access to the rooftop is restricted for safety reasons today.",
    category: "Rules",
    isPinned: false,
    expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // expired 2 days ago
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // posted 3 days ago
  });
  console.log("Notices seeded.");

  // 7. Seed Comments & Reactions
  console.log("Seeding comments and reactions...");
  // Comment on Notice 1
  await Comment.create({
    noticeId: notice1._id.toString(),
    authorId: residentUser.user.id,
    text: "Thanks for the early warning. I will plan my office calls accordingly since Wi-Fi router backup might drop.",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
  });

  // Reactions on Notice 1
  await Reaction.create({
    noticeId: notice1._id.toString(),
    userId: residentUser.user.id,
    type: "acknowledge",
  });

  // Reaction on Notice 2
  await Reaction.create({
    noticeId: notice2._id.toString(),
    userId: ownerUser.user.id,
    type: "acknowledge",
  });

  console.log("Seeding completed successfully.");
  await mongoose.disconnect();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Seeding failed with error:", err);
  process.exit(1);
});
