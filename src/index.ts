import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import mongoose, { Schema, model } from "mongoose";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
// Stripe has been relocated to frontend Next.js API routes
import dotenv from "dotenv";

dotenv.config();

// ── 1. COLLECTIONS (all schemas defined here, top of file) ──────────────

interface IBuilding {
  _id?: any;
  name: string;
  areaCode: string;
  address: string;
  ownerId: string;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt?: Date;
  suspended?: boolean;
}

interface IInvite {
  _id?: any;
  email: string;
  buildingId: string;
  status: "pending" | "claimed";
  invitedAt?: Date;
  claimedAt?: Date;
}

interface INotice {
  _id?: any;
  buildingId: string;
  authorId: string;
  title: string;
  description: string;
  category: "Maintenance" | "Emergency" | "Lost & Found" | "Events" | "Rules" | "General";
  imageUrl?: string;
  isPinned?: boolean;
  status?: "open" | "in_progress" | "resolved";
  expiresAt: Date;
  createdAt?: Date;
}

interface IComment {
  _id?: any;
  noticeId: string;
  authorId: string;
  text: string;
  createdAt?: Date;
}

interface IReaction {
  _id?: any;
  noticeId: string;
  userId: string;
  type: "acknowledge" | "question";
  createdAt?: Date;
}

interface IReport {
  _id?: any;
  buildingId: string;
  residentId: string;       // the submitting resident's userId
  residentName?: string;
  title: string;
  description: string;
  category: "Maintenance" | "Emergency" | "Lost & Found" | "General";
  imageUrl?: string;
  status: "open" | "in_progress" | "resolved";
  createdAt?: Date;
  updatedAt?: Date;
}

interface IUser {
  _id?: any;
  name: string;
  email: string;
  role?: string;
  buildingId?: string;
  suspended?: boolean;
}

const buildingSchema = new Schema<IBuilding>({
  name: { type: String, required: true },
  areaCode: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  ownerId: { type: String, required: true },
  plan: { type: String, enum: ["free", "growth", "unlimited"], default: "free" },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  createdAt: { type: Date, default: Date.now },
  suspended: { type: Boolean, default: false },
});

const inviteSchema = new Schema<IInvite>({
  email: { type: String, required: true },
  buildingId: { type: String, required: true },
  status: { type: String, enum: ["pending", "claimed"], default: "pending" },
  invitedAt: { type: Date, default: Date.now },
  claimedAt: { type: Date },
});

const noticeSchema = new Schema<INotice>({
  buildingId: { type: String, required: true },
  authorId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ["Maintenance", "Emergency", "Lost & Found", "Events", "Rules", "General"],
    required: true,
  },
  imageUrl: { type: String },
  isPinned: { type: Boolean, default: false },
  // Problem-report triage: only owners can change this
  status: {
    type: String,
    enum: ["open", "in_progress", "resolved"],
    default: "open",
  },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

const commentSchema = new Schema<IComment>({
  noticeId: { type: String, required: true },
  authorId: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const reactionSchema = new Schema<IReaction>({
  noticeId: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, enum: ["acknowledge", "question"], required: true },
  createdAt: { type: Date, default: Date.now },
});

// Resident problem reports — separate collection from owner notices
const reportSchema = new Schema<IReport>({
  buildingId: { type: String, required: true, index: true },
  residentId: { type: String, required: true, index: true },
  residentName: { type: String },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ["Maintenance", "Emergency", "Lost & Found", "General"],
    required: true,
  },
  imageUrl: { type: String },
  status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Better Auth user model schema mapped for query purposes
const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String },
  buildingId: { type: String },
  suspended: { type: Boolean, default: false },
}, { collection: "user" });

const Building = model<IBuilding>("Building", buildingSchema);
const Invite = model<IInvite>("Invite", inviteSchema);
const Notice = model<INotice>("Notice", noticeSchema);
const Comment = model<IComment>("Comment", commentSchema);
const Reaction = model<IReaction>("Reaction", reactionSchema);
const Report = model<IReport>("Report", reportSchema);
const User = model<IUser>("User", userSchema);

// ── 2. APP SETUP ──────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || process.env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP if it conflicts with local dev or Better Auth
}));
app.use(morgan("dev"));

// JSON parser middleware for general REST routes
app.use(express.json());

// Auth helper middleware
async function getSessionUser(req: express.Request) {
  // Test/Mock auth bypass for integration tests
  if (req.headers["x-test-user-id"] && req.headers["x-test-secret"] === "super-security-secret") {
    const userId = req.headers["x-test-user-id"] as string;
    const dbUser = await User.findById(userId);
    if (dbUser) {
      return {
        user: {
          id: dbUser._id.toString(),
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role || "resident",
          buildingId: dbUser.buildingId ? dbUser.buildingId.toString() : undefined,
        },
        session: {} as any
      };
    }
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (session && session.user) {
    const dbUser = await User.findById(session.user.id);
    if (dbUser?.suspended) {
      return null;
    }
  }
  return session;
}

// Session-derived auth middleware
interface AuthenticatedRequest extends express.Request {
  currentUser?: {
    id: string;
    email: string;
    name: string;
    role: string;
    buildingId?: string;
  };
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = await getSessionUser(req);
  if (!session || !session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  (req as AuthenticatedRequest).currentUser = session.user as any;
  next();
}

function canModify(user: any, doc: any) {
  if (doc.buildingId !== user.buildingId) return false; // never cross a building boundary
  if (user.role === "owner") return true;                // owner moderates their own building freely
  return doc.authorId === user.id;                        // resident can only touch their own posts
}

// ── 4. CRUD ROUTES ────────────────────────────────────────────────────

// -- Users --
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find(req.query as any);
    res.json(users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role, buildingId: u.buildingId })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, buildingId: user.buildingId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Buildings --
app.post("/api/buildings", async (req, res) => {
  try {
    if (!req.body.areaCode) {
      const city = "DHK";
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const randomPrefix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      req.body.areaCode = `${city}-${randomPrefix}-${randomDigits}`;
    }
    const building = await Building.create(req.body);
    
    if (req.body.ownerId) {
      await User.findByIdAndUpdate(req.body.ownerId, { buildingId: building._id, role: "owner" });
    }

    res.status(201).json(building);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/buildings/:param", async (req, res) => {
  try {
    const param = req.params.param;
    const isId = mongoose.Types.ObjectId.isValid(param);
    const building = await Building.findOne(isId ? { _id: param } : { areaCode: param });
    if (!building) return res.status(404).json({ message: "Building not found" });
    res.json(building);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Invites --
const PLAN_LIMITS = { free: 20, growth: 40, unlimited: Infinity };

app.post("/api/invites", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    if (user.role !== "owner") {
      return res.status(401).json({ message: "Unauthorized. Owner only." });
    }

    const { email, buildingId } = req.body;
    if (buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ message: "Building not found." });
    }

    // Limit check
    const activeCount = await Invite.countDocuments({
      buildingId,
      status: { $in: ["pending", "claimed"] },
    });
    const currentLimit = PLAN_LIMITS[building.plan as keyof typeof PLAN_LIMITS] || 20;

    if (activeCount >= currentLimit) {
      return res.status(403).json({ message: "Resident limit reached for your plan. Please upgrade." });
    }

    // Check if user already invited
    const existingInvite = await Invite.findOne({ email, buildingId });
    if (existingInvite) {
      return res.status(400).json({ message: "An invite has already been sent to this email for this building." });
    }

    const invite = await Invite.create({ email, buildingId });
    res.status(201).json(invite);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/invites", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const invites = await Invite.find({ buildingId: user.buildingId });
    res.json(invites);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/invites/check", async (req, res) => {
  try {
    const { email, areaCode } = req.query as any;
    const building = await Building.findOne({ areaCode });
    if (!building) return res.status(404).json({ message: "Invalid building code" });

    const invite = await Invite.findOne({ email, buildingId: building._id, status: "pending" });
    if (!invite) return res.status(404).json({ message: "No pending invite for this email" });

    res.json({ valid: true, buildingId: building._id, inviteId: invite._id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/invites/:id", async (req, res) => {
  try {
    const invite = await Invite.findByIdAndUpdate(
      req.params.id,
      { status: "claimed", claimedAt: new Date() },
      { new: true }
    );
    res.json(invite);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Owner can delete a pending invite to free up a slot (added helper feature)
app.delete("/api/invites/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    if (user.role !== "owner") {
      return res.status(401).json({ message: "Unauthorized. Owner only." });
    }

    const invite = await Invite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: "Invite not found" });

    // Validate that owner owns the building the invite belongs to
    const building = await Building.findById(invite.buildingId);
    if (!building || building.ownerId !== user.id || invite.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Unauthorized to delete this invite." });
    }

    await Invite.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Notices --
app.get("/api/notices", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const { buildingId, authorId, manage, ...clientFilters } = req.query as any;

    const isManage = manage === "true";

    let scope: Record<string, any>;

    if (isManage) {
      // "My posts" view — always scoped to the logged-in user's own notices
      scope = { buildingId: user.buildingId, authorId: user.id };
    } else if (user.role === "resident") {
      // Board view for residents: only show notices authored by the building owner
      // This prevents residents from seeing other residents' reports on the main board
      const building = await Building.findById(user.buildingId);
      if (!building) return res.status(403).json({ message: "Building not found." });
      scope = { buildingId: user.buildingId, authorId: building.ownerId };
    } else {
      // Board view for owners/admin: all notices in the building
      scope = { buildingId: user.buildingId };
    }

    const notices = await Notice.find({ ...scope, ...clientFilters });
    res.json(notices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/notices/:id", async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: "Notice not found" });
    res.json(notice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notices", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const { buildingId, authorId, ...rest } = req.body;

    const notice = await Notice.create({
      ...rest,
      buildingId: user.buildingId,
      authorId: user.id,
    });
    res.status(201).json(notice);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/notices/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: "Notice not found" });
    if (!canModify(user, notice)) return res.status(403).json({ message: "Forbidden" });

    const { buildingId, authorId, ...updateData } = req.body;

    // Only owners can change isPinned and status (problem triage)
    if (user.role !== "owner") {
      delete updateData.isPinned;
      delete updateData.status;
    }

    const updatedNotice = await Notice.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedNotice);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/notices/:id/pin", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: "Notice not found" });

    if (user.role !== "owner" || notice.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Notice.findByIdAndUpdate(
      req.params.id,
      { isPinned: req.body.isPinned },
      { new: true }
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/notices/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: "Notice not found" });
    if (!canModify(user, notice)) return res.status(403).json({ message: "Forbidden" });

    await Notice.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resident Reports (separate collection) ────────────────────────────────

// POST /api/reports — resident submits a new problem report
app.post("/api/reports", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    if (user.role !== "resident") {
      return res.status(403).json({ message: "Only residents can submit reports." });
    }
    if (!user.buildingId) {
      return res.status(403).json({ message: "You must be in a building to submit a report." });
    }

    const { title, description, category, imageUrl } = req.body;

    const report = await Report.create({
      buildingId: user.buildingId,    // always from session
      residentId: user.id,            // always from session
      residentName: user.name,
      title,
      description,
      category,
      imageUrl: imageUrl || "",
      status: "open",
    });

    res.status(201).json(report);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/reports — owners: all building reports | residents: own reports only
app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    if (!user.buildingId) return res.status(403).json({ message: "No building assigned." });

    const scope = user.role === "owner"
      ? { buildingId: user.buildingId }
      : { buildingId: user.buildingId, residentId: user.id };

    const reports = await Report.find(scope).sort({ createdAt: -1 });
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:id — fetch single report (must be in same building)
app.get("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const report = await Report.findById(req.params.id);
    if (!report || report.buildingId !== user.buildingId) {
      return res.status(404).json({ message: "Report not found." });
    }
    // Residents can only read their own
    if (user.role === "resident" && report.residentId !== user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/reports/:id — resident edits own; owner changes status only
app.patch("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const report = await Report.findById(req.params.id);
    if (!report || report.buildingId !== user.buildingId) {
      return res.status(404).json({ message: "Report not found." });
    }

    if (user.role === "resident") {
      // Residents can only update their own report's content
      if (report.residentId !== user.id) {
        return res.status(403).json({ message: "Forbidden: you can only edit your own reports." });
      }
      const { title, description, category, imageUrl } = req.body;
      const updated = await Report.findByIdAndUpdate(
        req.params.id,
        { title, description, category, imageUrl, updatedAt: new Date() },
        { new: true }
      );
      return res.json(updated);
    }

    if (user.role === "owner") {
      // Owners can only triage (change status), not edit report content
      const { status } = req.body;
      const validStatuses = ["open", "in_progress", "resolved"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value." });
      }
      const updated = await Report.findByIdAndUpdate(
        req.params.id,
        { ...(status ? { status } : {}), updatedAt: new Date() },
        { new: true }
      );
      return res.json(updated);
    }

    return res.status(403).json({ message: "Forbidden." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/reports/:id — resident deletes own report only
app.delete("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const report = await Report.findById(req.params.id);
    if (!report || report.buildingId !== user.buildingId) {
      return res.status(404).json({ message: "Report not found." });
    }
    if (report.residentId !== user.id) {
      return res.status(403).json({ message: "Forbidden: you can only delete your own reports." });
    }
    await Report.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Comments --
app.post("/api/comments", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const { noticeId, text } = req.body;
    const notice = await Notice.findById(noticeId);
    if (!notice || notice.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const comment = await Comment.create({
      noticeId,
      text,
      authorId: user.id,
    });
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/comments/:noticeId", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice || notice.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const comments = await Comment.find({ noticeId: req.params.noticeId });
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Reactions --
app.post("/api/reactions", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const { noticeId, type } = req.body;

    const notice = await Notice.findById(noticeId);
    if (!notice || notice.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existingReaction = await Reaction.findOne({ noticeId, userId: user.id });

    if (existingReaction) {
      if (existingReaction.type === type) {
        await Reaction.findByIdAndDelete(existingReaction._id);
        return res.json({ message: "Reaction removed" });
      } else {
        existingReaction.type = type;
        await existingReaction.save();
        return res.json(existingReaction);
      }
    }

    const reaction = await Reaction.create({
      noticeId,
      userId: user.id,
      type,
    });
    res.status(201).json(reaction);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/reactions/:noticeId", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).currentUser!;
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice || notice.buildingId !== user.buildingId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const reactions = await Reaction.find({ noticeId: req.params.noticeId });
    res.json(reactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -- Payments / Stripe (Relocated to Next.js Client) --

// ── 4.5. ADMIN ONLY ROUTES ─────────────────────────────────────────────

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

app.use("/api/admin", requireAdmin);

app.get("/api/admin/buildings", async (req, res) => {
  try {
    const buildings = await Building.find({});
    res.json(buildings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/buildings/:id", async (req, res) => {
  try {
    const building = await Building.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(building);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/buildings/:id", async (req, res) => {
  try {
    await Building.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/notices", async (req, res) => {
  try {
    const notices = await Notice.find({});
    res.json(notices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/notices/:id", async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  try {
    const [buildingCount, noticeCount, userCount, byPlan] = await Promise.all([
      Building.countDocuments({}),
      Notice.countDocuments({}),
      User.countDocuments({}),
      Building.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }]),
    ]);
    res.json({ buildingCount, noticeCount, userCount, byPlan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. START ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/neighbornotes";

mongoose.connect(MONGO_URI).then(() => {
  console.log("Connected to MongoDB successfully via Mongoose.");
  app.listen(PORT, () => {
    console.log(`NeighborNotes Express Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error("Mongoose connection failure:", err);
});
