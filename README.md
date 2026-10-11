# L2: Secure Authentication & Subscription-Based Content Access with Token Blacklisting

Backend evaluation project implementing role-based access control (RBAC), subscription management with dynamic 30-day expiry, token blacklisting using MongoDB TTL index, and content access business logic.

---

## Tech Stack
- **Node.js** & **Express.js**
- **MongoDB** & **Mongoose**
- **JSONWebToken (JWT)** (Access token 15 mins, Refresh token 7 days)
- **Bcrypt** (Password hashing with 10 salt rounds)
- **Dotenv** & **CORS**

---

## Project Structure
```
secure-auth-subscription/
├── config/
│   └── db.js                        # Database connection setup
├── models/
│   ├── User.model.js                # User schema (roles, plans, expiry)
│   ├── Blacklist.model.js           # Blacklisted tokens schema with TTL
│   └── Content.model.js             # Content schema (free/premium, price)
├── middlewares/
│   ├── auth.middleware.js           # JWT verification, blacklist check & auto-downgrade
│   └── role.middleware.js           # Role-based access control (RBAC)
├── routes/
│   ├── auth.routes.js               # Signup, login, logout, refresh routes
│   ├── subscription.routes.js       # Subscribe, status, renew, cancel routes
│   └── content.routes.js            # Free & premium content CRUD + discounts
├── .env                             # Environment variables
├── .env.example                     # Environment template
├── index.js                         # Application entry point
├── package.json
└── README.md
```

---

## Setup & Installation

1. **Clone the repository / navigate to project directory:**
   ```bash
   cd secure-auth-subscription
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory (refer to `.env.example`):
   ```env
   PORT=8080
   MONGO_URI=mongodb://127.0.0.1:27017/subscription_auth_db
   JWT_SECRET=super_secret_jwt_access_token_key_2026
   JWT_REFRESH_SECRET=super_secret_jwt_refresh_token_key_2026
   ```
   *(Note: Replace `MONGO_URI` with your MongoDB Atlas connection string if using cloud database)*

4. **Start the server:**
   ```bash
   npm start
   # or for development:
   npm run dev
   ```

---

## API Endpoints

### 1. Authentication Routes
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/signup` | Register new user (hashing password) | No |
| `POST` | `/login` | Authenticate user & issue tokens | No |
| `POST` | `/logout` | Invalidate & blacklist access/refresh tokens | Yes |
| `POST` | `/refresh` | Generate new access token using refresh token | No |

#### Example Payloads:
- **POST `/signup`**
  ```json
  {
    "username": "satyajit",
    "email": "satyajit@example.com",
    "password": "Password123",
    "role": "user"
  }
  ```
- **POST `/login`**
  ```json
  {
    "email": "satyajit@example.com",
    "password": "Password123"
  }
  ```
  Response contains `accessToken` (15m expiry) and `refreshToken` (7d expiry).

- **POST `/logout`**
  Headers: `Authorization: Bearer <accessToken>`
  Body (optional):
  ```json
  {
    "refreshToken": "<refreshToken>"
  }
  ```

- **POST `/refresh`**
  ```json
  {
    "refreshToken": "<refreshToken>"
  }
  ```

---

### 2. Subscription Routes (Protected)
All subscription routes require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/subscribe` | Buy a plan (`free`, `premium`, `pro`) | Authenticated Users |
| `GET` | `/subscription-status`| Check subscription validity & days left | Authenticated Users |
| `PATCH`| `/renew` | Renew active subscription before expiry | Authenticated Users |
| `POST` | `/cancel-subscription`| Manually cancel subscription (downgrades to free)| Authenticated Users |
| `GET` | `/admin/subscriptions`| View all user subscriptions | Admin Only |
| `PATCH`| `/admin/subscription/:userId`| Update user subscription | Admin Only |

#### Subscription Business Logic:
1. **Dynamic Expiry:** When subscribing to `premium` or `pro`, `subscriptionEndDate` is set exactly 30 days ahead (`Date.now() + 30 * 24 * 60 * 60 * 1000`).
2. **Auto-Downgrade:** The `authMiddleware` and `/subscription-status` route dynamically compare `currentDate > subscriptionEndDate`. If expired, the user's plan is automatically reset to `free` in the database.
3. **Renewal Constraint:** Users can only renew (`PATCH /renew`) while their subscription is still active. If it has already expired, renewal is rejected, requiring a new purchase via `POST /subscribe`.

---

### 3. Content Routes (RBAC Protected)

| Method | Endpoint | Description | Access Control |
|---|---|---|---|
| `GET` | `/content/free` | View all free content | All authenticated users |
| `GET` | `/content/premium` | View premium content | Premium & Pro users (or Admin) |
| `POST` | `/content` | Create new content | Admin Only |
| `PUT` | `/content/:id` | Update content item | Admin Only |
| `DELETE`| `/content/:id` | Delete content item | Admin Only |
| `POST` | `/content/purchase/:id`| Purchase content (applies 20% discount for Pro) | Authenticated Users |

#### Pro User Perks:
- Access to both free and premium content.
- 20% automatic discount applied during content purchases (`POST /content/purchase/:id`).

---

## Token Blacklisting Mechanism
- When a user logs out, the access token (and optional refresh token) is inserted into the `Blacklist` collection.
- The `authMiddleware` queries the blacklist collection on every incoming protected request.
- The blacklist collection utilizes a MongoDB TTL (Time To Live) index of 7 days (`expires: '7d'`), ensuring old tokens are automatically cleaned up without bloating the database.
