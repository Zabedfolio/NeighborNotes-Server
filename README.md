# NeighborNotes — Backend (Server)

<div align="center">

**REST API for the NeighborNotes residential notice board platform.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express)](https://expressjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb)](https://mongodb.com)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)](https://stripe.com)

</div>

> **📡 Live Production API: [neighbor-notes-server.vercel.app](https://neighbor-notes-server.vercel.app)**  
> **🚀 Frontend App: [neighbor-notes-client-eta.vercel.app](https://neighbor-notes-client-eta.vercel.app)**

---

## 📖 About

This is the Express.js REST API server powering **NeighborNotes** — a verified digital notice board platform for residential apartment buildings.

> **📝 Full case study by the author:**
> **🔗 [zabedmahmud.com/case-study/neighbornotes](https://zabedmahmud.com/case-study/neighbornotes)**

The server handles:
- **Authentication** via [Better Auth](https://better-auth.com) (session-based, cookie auth)
- **Role-based access control** (owner / resident / admin)
- **CRUD operations** for buildings, notices, invites, and problem reports
- **Image uploads** via Cloudinary
- **Stripe** subscription management and webhook processing
- **Public analytics** endpoints for landing page stats

---

## 🗂️ Project Structure

```
NeighborNotes-server/
├── src/
│   └── index.ts         # Main entry point — all routes, models, and app setup
├── dist/                # Compiled JavaScript output (after `npm run build`)
├── .env                 # Environment variables (never commit this)
├── package.json
└── tsconfig.json
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | **Node.js 18+** |
| Framework | **Express.js 5** |
| Language | **TypeScript 5** |
| Database | **MongoDB** via **Mongoose 9** |
| Authentication | **Better Auth** (session cookies) |
| Image Storage | **Cloudinary** |
| Payments | **Stripe** (Checkout + Webhooks) |
| Security | **Helmet**, **CORS** |
| Logging | **Morgan** |
| Environment | **dotenvx** |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB** running locally (`mongodb://127.0.0.1:27017/neighbornotes`) or a MongoDB Atlas URI
- A **Stripe** account (for payment features)
- A **Cloudinary** account (for image uploads)

### 1. Install Dependencies

```bash
cd NeighborNotes-server
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/neighbornotes

# Better Auth
BETTER_AUTH_SECRET=your_secret_here
BETTER_AUTH_URL=http://localhost:5000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Cloudinary (image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Product IDs
STRIPE_PRODUCT_ID_FREE=prod_your_free_id
STRIPE_PRODUCT_ID_GROWTH=prod_your_growth_id
STRIPE_PRODUCT_ID_UNLIMITED=prod_your_unlimited_id

# Stripe Price IDs (linked to products)
STRIPE_PRICE_ID_GROWTH=price_your_growth_price_id
STRIPE_PRICE_ID_UNLIMITED=price_your_unlimited_price_id
```

### 3. Development Mode (with hot reload)

```bash
npm run dev
```

### 4. Production Build

```bash
npm run build    # Compile TypeScript → dist/
npm run start    # Run compiled output
```

---

## 📡 API Reference

All routes are prefixed with the server base URL (default: `http://localhost:5000`).

### 🔐 Auth (Better Auth — handled internally)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/sign-up/email` | Register a new user |
| `POST` | `/api/auth/sign-in/email` | Sign in a user |
| `POST` | `/api/auth/sign-out` | Sign out |
| `GET`  | `/api/auth/get-session` | Get current session |

---

### 🏢 Buildings

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/buildings` | ✅ | List all buildings |
| `POST` | `/api/buildings` | ✅ Owner | Create a new building |
| `GET`  | `/api/buildings/:id` | ✅ | Get building by ID |
| `PATCH`| `/api/buildings/:id` | ✅ Owner | Update building details |
| `DELETE`| `/api/buildings/:id` | ✅ Owner | Delete a building |

---

### 👤 Users & Profiles

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/users` | ✅ | List users |
| `GET`  | `/api/users/me` | ✅ | Get current user profile |
| `PATCH`| `/api/users/profile` | ✅ | Update name / floor / flat |

---

### 📬 Invites

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/invites` | ✅ Owner | List building invites |
| `POST` | `/api/invites` | ✅ Owner | Send invite email |
| `DELETE`| `/api/invites/:id` | ✅ Owner | Revoke a pending invite |
| `POST` | `/api/invites/claim` | Public | Resident claims invite with area code |

---

### 📋 Notices

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/notices` | ✅ | Get all notices for building |
| `POST` | `/api/notices` | ✅ | Post a new notice |
| `PATCH`| `/api/notices/:id` | ✅ Author/Owner | Edit a notice |
| `DELETE`| `/api/notices/:id` | ✅ Owner | Delete a notice |
| `PATCH`| `/api/notices/:id/pin` | ✅ Owner | Toggle pin status |

---

### 🔧 Reports (Problem Reports)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/reports` | ✅ | Get reports for building |
| `POST` | `/api/reports` | ✅ Resident | Submit a problem report |
| `PATCH`| `/api/reports/:id` | ✅ Author/Owner | Update report or change status |
| `DELETE`| `/api/reports/:id` | ✅ Author/Owner | Delete a report |

---

### 💳 Subscriptions & Stripe

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/subscriptions` | Public | Get all subscription tier definitions |
| `POST` | `/api/subscriptions` | Admin | Create/update a subscription tier |
| `PATCH`| `/api/subscriptions/:id` | Admin | Edit a tier |
| `DELETE`| `/api/subscriptions/:id` | Admin | Delete a tier |
| `POST` | `/api/checkout` | ✅ Owner | Create Stripe Checkout Session |
| `POST` | `/api/webhooks/stripe` | Stripe | Handle payment success webhook |

---

### 📊 Analytics

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET`  | `/api/admin/stats` | Admin | Platform-wide stats (buildings, users, notices) |
| `GET`  | `/api/public/stats` | Public | Live counters for landing page (reports, resolved) |

---

### 🖼️ Images

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/upload` | ✅ | Upload image to Cloudinary, returns URL |

---

## 🗃️ Database Models

### `User`
```
id, name, email, role (owner/resident/admin),
buildingId, floor, flat, emailVerified, suspended, createdAt
```

### `Building`
```
id, name, address, areaCode, ownerId, plan (free/growth/unlimited),
stripeCustomerId, createdAt
```

### `Invite`
```
id, email, buildingId, status (pending/claimed), invitedAt
```

### `Notice`
```
id, title, description, category, imageUrl, isPinned,
expiresAt, authorId, buildingId, createdAt
```

### `Report`
```
id, title, description, category, imageUrl, status (open/in_progress/resolved),
residentId, residentName, residentFloor, residentFlat, buildingId, createdAt
```

### `SubscriptionTier`
```
id, name, price, period, limitNotices, limitNoticesVal,
limitResidents, limitResidentsVal, features, isPopular
```

---

## 🔒 Security

- **Helmet** sets secure HTTP headers
- **CORS** restricts origins to the frontend URL
- **Better Auth** manages session tokens via secure cookies
- **Role checks** — every protected route validates `owner` / `resident` / `admin` before proceeding
- **Building isolation** — users can only read/write data within their own `buildingId`
- Stripe webhooks verified via `stripe-signature` header

---

## 🌱 Auto-Seeding

On first startup (when the `subscriptiontiers` collection is empty), the server automatically seeds the three default subscription tier documents (Free, Growth, Unlimited) so the pricing page works out of the box.

---

## 👤 Author

**Zabed Mahmud**
- Portfolio: [zabedmahmud.com](https://zabedmahmud.com)
- Case Study: [zabedmahmud.com/case-study/neighbornotes](https://zabedmahmud.com/case-study/neighbornotes)

---

## 📄 License

This project is for portfolio and case study purposes. All rights reserved © Zabed Mahmud.
