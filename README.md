# Apartment Management System (AMS)

A full-stack web application for managing apartment operations, built with **Node.js**, **Express.js**, **EJS**, and **MongoDB**. The system provides role-based interfaces for both administrators and tenants, covering the complete rental lifecycle from application to payment settlement.

---

# Project Introduction

### Background of the Project

Managing apartment operations manually—tracking tenant applications, room availability, rent payments, and utility billing—is error-prone and time-consuming. As residential properties scale, administrators require a centralized digital platform to streamline these processes while giving tenants self-service access to their rental information.

This project was developed as a **NoSQL database-driven web application** to demonstrate the practical application of **MongoDB** in a real-world management scenario. It showcases how document-oriented databases can efficiently model complex relationships between users, rooms, transactions, and notifications within a multi-tenant property system.

### Purpose of the System

The **Apartment Management System (AMS)** serves as a comprehensive property management platform that:

- **Digitizes the rental application workflow** — from tenant registration, document submission, and admin review to room assignment.
- **Automates financial tracking** — including rent payments, deposit processing, utility billing, and transaction ledger management.
- **Centralizes communication** — through an in-app announcement and notification system with audience targeting capabilities.
- **Provides administrative oversight** — via a dashboard with occupancy statistics, revenue analytics, and tenant lifecycle management.

---

# Objectives and System Overview

### Project Objectives

1. **Implement a role-based access control system** that separates administrator and tenant functionalities through session-based authentication with bcrypt password hashing.
2. **Design a NoSQL database architecture** using MongoDB and Mongoose ODM to model apartment management entities as flexible, schema-defined document collections.
3. **Build a complete rental lifecycle workflow** covering user registration, rent application with document uploads, admin approval/rejection, room assignment, and lease management.
4. **Develop a financial management module** that handles deposit payments, monthly rent billing, utility invoicing, and multi-method payment processing (GCash, Bank Transfer, Cash).
5. **Create a dynamic notification system** with audience-targeted announcements, automated rent reminders, and per-user read/archive tracking.
6. **Deliver a server-rendered multi-page application** using EJS templating with reusable view partials for a consistent user interface.

### Overview of the Developed Application

The AMS is a **server-rendered web application** powered by Express.js that serves two primary user roles:

| Role | Capabilities |
|------|-------------|
| **Admin** | Dashboard analytics, application review (accept/reject), tenant management (active/archived), room & unit management, utility invoice dispatch, payment confirmation, announcement broadcasting, and revenue reporting with time-based filters. |
| **Tenant** | Account registration & login, available room preview, rent application with ID/NBI document upload, room status monitoring, bill payment (rent + utilities), lease extension/termination, transaction history, profile settings, and notification management. |

The application follows an **MVC-inspired architecture** with Express routes acting as controllers, Mongoose models defining the data layer, and EJS views handling presentation. File uploads for tenant documents are managed through Multer middleware, and sessions are maintained via `express-session`.

---

# System Architecture

### Frontend, Backend, and Database Integration

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
│   HTML Pages rendered by EJS Templates + TailwindCSS CDN    │
│   Client-side JS (public/js/main.js)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP Requests (GET/POST)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                │
│                                                             │
│  server.js ─── Entry Point & Middleware Configuration       │
│     ├── express-session ─── Session Management              │
│     ├── multer ─── File Upload Handling                     │
│     ├── bcryptjs ─── Password Hashing                       │
│     └── dotenv ─── Environment Variable Loading             │
│                                                             │
│  routes/                                                    │
│     ├── authRoutes.js ─── Login, Register, Logout           │
│     ├── tenantRoutes.js ─── Tenant-side Operations          │
│     └── adminRoutes.js ─── Admin-side Operations            │
│                                                             │
│  Global Middleware:                                          │
│     ├── Notification Context Loader (per-request)           │
│     └── Automated Rent Reminder Subsystem (6-hour interval) │
└──────────────────────────┬──────────────────────────────────┘
                           │  Mongoose ODM Queries
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 DATABASE (MongoDB)                           │
│         Database: ApartmentManagementSystem                  │
│                                                             │
│  Collections:                                               │
│     ├── users                                               │
│     ├── rooms                                               │
│     ├── tenants                                             │
│     ├── rentapplications                                    │
│     ├── transactions                                        │
│     └── announcements                                       │
└─────────────────────────────────────────────────────────────┘
```

### Node.js + Multi-File + MongoDB Workflow

The application is organized into a **multi-file modular structure** where each concern is separated into its own directory:

```
ApartmentManagementSystem_NodeJS_and_mongoDB_version/
├── config/                  # Database connection configuration
│   └── database.js          # MongoDB/Mongoose connection + auto room seeding
├── models/                  # Mongoose schema definitions (6 models)
│   ├── User.js              # User accounts with bcrypt pre-save hook
│   ├── Room.js              # Apartment unit inventory with utilities
│   ├── Tenant.js            # Active/archived tenant profiles
│   ├── RentApplication.js   # Rental application submissions
│   ├── Transaction.js       # Payment and billing records
│   └── Announcement.js      # Notification and announcement entries
├── routes/                  # Express route controllers
│   ├── authRoutes.js        # Authentication flow (login/register/logout)
│   ├── tenantRoutes.js      # All tenant-facing operations
│   └── adminRoutes.js       # All admin-facing operations
├── views/                   # EJS template files
│   ├── partials/            # Reusable layout components (header, footer, sidebar, topbar)
│   ├── admin/               # Admin panel screens (dashboard, units, tenants, etc.)
│   └── *.ejs                # Tenant-facing pages (home, login, register, myRoom, etc.)
├── public/                  # Static assets served to the client
│   └── js/main.js           # Client-side JavaScript
├── uploads/                 # Uploaded tenant documents (ID, NBI clearance)
│   └── applications/
├── server.js                # Application entry point and middleware stack
├── dbCheck.js               # Database reset and admin account seeder
├── seedMockData.js          # Mock data generator (30 users, tenants, transactions)
├── package.json             # Project metadata and dependency declarations
└── .env                     # Environment variables (MONGODB_URI, SESSION_SECRET, PORT)
```

**Request Lifecycle:**

1. A client sends an HTTP request to the Express server (`server.js`).
2. Global middleware loads session data, evaluates the user's notification context, and attaches audience-filtered announcements to the response.
3. The request is routed to the appropriate route handler (`authRoutes`, `tenantRoutes`, or `adminRoutes`) based on the URL path.
4. The route handler performs business logic, interacting with MongoDB through Mongoose models to query or mutate data.
5. The handler renders an EJS view template, passing the retrieved data as local variables for dynamic HTML generation.
6. The server responds with the fully rendered HTML page back to the client.

---

# Database Design

### MongoDB Database Structure

The system uses **6 Mongoose collections**, each defined with strict schemas to enforce data integrity while leveraging MongoDB's document-oriented flexibility.

#### `users` Collection
Stores registered accounts for both tenants and administrators.

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | String | User's first name (required, trimmed) |
| `lastName` | String | User's last name (required, trimmed) |
| `emailAddress` | String | Unique login email (required, lowercase) |
| `password` | String | Bcrypt-hashed password (auto-hashed via pre-save hook) |
| `role` | String | Either `tenant` or `admin` (default: `tenant`) |
| `readAnnouncements` | [ObjectId] | Array of announcement IDs the user has read |
| `clearedAnnouncements` | [ObjectId] | Array of announcement IDs the user has archived |
| `createdAt` | Date | Account creation timestamp |

#### `rooms` Collection
Represents the 14 studio apartment units across 3 floors.

| Field | Type | Description |
|-------|------|-------------|
| `roomName` | String | Unique room identifier (e.g., `Room A` through `Room N`) |
| `floor` | Number | Floor level (1, 2, or 3) |
| `type` | String | Room type (default: `Studio Type`) |
| `price` | Number | Monthly base rent (₱4,000 for Floors 1–2, ₱3,500 for Floor 3) |
| `isAvailable` | Boolean | Vacancy status flag |
| `currentTenant` | ObjectId | Reference to the occupying User document |
| `utilities.electricity` | Number | Current electricity billing amount |
| `utilities.water` | Number | Current water billing amount |
| `utilities.isBilled` | Boolean | Whether a utility invoice has been dispatched |

#### `tenants` Collection
Tracks active and archived tenant profiles linked to user accounts.

| Field | Type | Description |
|-------|------|-------------|
| `user` | ObjectId | Reference to the User document (unique) |
| `suffix` | String | Name suffix (e.g., Jr., Sr.) |
| `gender` | String | Gender (`Male`, `Female`, `Other`) |
| `contactNo` | String | Contact number (may include `EXT:` for lease extension data) |
| `room` | ObjectId | Reference to the assigned Room document |
| `status` | String | Tenant status (`Active`, `Archived`, `Pending Moveout`) |
| `isArchived` | Boolean | Soft-delete flag for past tenants |
| `createdAt` | Date | Tenant record creation date |

#### `rentapplications` Collection
Stores rental application submissions with uploaded document paths.

| Field | Type | Description |
|-------|------|-------------|
| `user` | ObjectId | Reference to the applicant User |
| `firstName`, `lastName`, `suffix` | String | Applicant personal details |
| `gender` | String | Applicant gender |
| `contactNo` | String | Contact phone number |
| `occupants` | Number | Number of room occupants |
| `monthsOfRent` | Number | Requested lease duration (3, 6, or 12 months) |
| `roomRequested` | String | Target room name (e.g., `Room A`) |
| `status` | String | Application status (`pending`, `accepted`, `rejected`) |
| `documents.validIdFrontPath` | String | File path to front of valid ID |
| `documents.validIdBackPath` | String | File path to back of valid ID |
| `documents.nbiClearancePath` | String | File path to NBI clearance document |
| `createdAt` | Date | Submission timestamp |

#### `transactions` Collection
Records all financial transactions including deposits, rent, and utility payments.

| Field | Type | Description |
|-------|------|-------------|
| `user` | ObjectId | Reference to the paying User |
| `roomName` | String | Associated room name |
| `amount` | Number | Transaction amount in PHP (₱) |
| `type` | String | Transaction type (`deposit`, `rent`, `utilities`) |
| `paymentMethod` | String | Payment method (`gcash`, `bank`, `cash`) |
| `status` | String | Processing status (`pending`, `completed`) |
| `tenantPaid` | Boolean | Whether the tenant has submitted payment |
| `createdAt` / `updatedAt` | Date | Auto-managed timestamps |

#### `announcements` Collection
Manages system notifications and admin-broadcasted announcements.

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Announcement title |
| `body` | String | Announcement body content |
| `tag` | String | Category tag (`General`, `Urgent`, `Reminder`) |
| `sendTo` | String | Target audience (`All`, `Tenants`, `Non-Tenants`, `Specific`) |
| `targetUser` | ObjectId | Specific user target (for private notifications) |
| `channels` | [String] | Delivery channels (`in-app`, `sms`, `email`) |
| `status` | String | Delivery status (`sent`, `scheduled`, `draft`) |
| `scheduledDate` | Date | Scheduled send date (if applicable) |
| `recipientsCount` | Number | Estimated recipient count |
| `createdAt` | Date | Creation timestamp |

### Sample Database Records

Below are representative JSON documents for each collection:

**User Document:**
```json
{
    "_id": "ObjectId('6850a1b2c3d4e5f6a7b8c9d0')",
    "firstName": "Maria",
    "lastName": "Santos",
    "emailAddress": "maria.santos@email.com",
    "password": "$2a$10$xK8vL2mN3oP4qR5sT6uV7e...",
    "role": "tenant",
    "readAnnouncements": [],
    "clearedAnnouncements": [],
    "createdAt": "2026-03-15T08:30:00.000Z"
}
```

**Room Document:**
```json
{
    "_id": "ObjectId('6850b2c3d4e5f6a7b8c9d0e1')",
    "roomName": "Room A",
    "floor": 1,
    "type": "Studio Type",
    "price": 4000,
    "isAvailable": false,
    "currentTenant": "ObjectId('6850a1b2c3d4e5f6a7b8c9d0')",
    "utilities": {
        "electricity": 850,
        "water": 320,
        "isBilled": true
    }
}
```

**Rent Application Document:**
```json
{
    "_id": "ObjectId('6850c3d4e5f6a7b8c9d0e1f2')",
    "user": "ObjectId('6850a1b2c3d4e5f6a7b8c9d0')",
    "firstName": "Maria",
    "lastName": "Santos",
    "suffix": "",
    "gender": "Female",
    "contactNo": "9171234567",
    "occupants": 2,
    "monthsOfRent": 6,
    "roomRequested": "Room A",
    "status": "accepted",
    "documents": {
        "validIdFrontPath": "uploads/applications/Santos-Maria_1710489000000.jpg",
        "validIdBackPath": "uploads/applications/Santos-Maria_1710489000001.jpg",
        "nbiClearancePath": "uploads/applications/Santos-Maria_1710489000002.jpg"
    },
    "createdAt": "2026-03-15T09:00:00.000Z"
}
```

**Transaction Document:**
```json
{
    "_id": "ObjectId('6850d4e5f6a7b8c9d0e1f2a3')",
    "user": "ObjectId('6850a1b2c3d4e5f6a7b8c9d0')",
    "roomName": "Room A",
    "amount": 4000,
    "type": "deposit",
    "paymentMethod": "gcash",
    "status": "completed",
    "tenantPaid": true,
    "createdAt": "2026-03-16T10:00:00.000Z",
    "updatedAt": "2026-03-16T10:00:00.000Z"
}
```

**Announcement Document:**
```json
{
    "_id": "ObjectId('6850e5f6a7b8c9d0e1f2a3b4')",
    "title": "Rent Due Reminder: 1 Week Left",
    "body": "Friendly reminder: Your next rent cycle is due on April 15, 2026. Please ensure your balance is settled to avoid issues.",
    "tag": "Reminder",
    "sendTo": "Specific",
    "targetUser": "ObjectId('6850a1b2c3d4e5f6a7b8c9d0')",
    "channels": ["in-app"],
    "status": "sent",
    "scheduledDate": null,
    "recipientsCount": 24,
    "createdAt": "2026-04-08T06:00:00.000Z"
}
```

---

# System Features and Demonstration

### Main Functionalities

#### 1. Authentication & User Management
- **User Registration** with email validation and duplicate checking.
- **Secure Login** with bcrypt password comparison and session-based authentication.
- **Role-Based Access Control** — tenants and admins are routed to separate interfaces upon login.
- **Profile Settings** — tenants can update personal information and change passwords.

#### 2. Room Preview & Rent Application
- **Available Room Listings** — tenants can browse vacant studio units across 3 floors with pricing details.
- **Rent Application Form** — applicants provide personal info, select a room, specify lease duration (3/6/12 months), and upload required documents (Valid ID front & back, NBI Clearance) via Multer file uploads.
- **Application Status Tracking** — submitted applications are tracked as `pending`, `accepted`, or `rejected`.

#### 3. Admin Application Review
- **Pending Applications Queue** — admins review incoming applications with full applicant details and uploaded documents.
- **Accept/Reject Workflow** — accepting an application assigns the room to the tenant and auto-rejects conflicting applications for the same room. Rejection supports custom reason messages.
- **Automated Notifications** — acceptance and rejection decisions automatically dispatch targeted announcements to the applicant.

#### 4. Room & Unit Management (Admin)
- **Unit Overview Grid** — displays all 14 rooms with status (vacant/active), tenant name, monthly rent, occupants count, and next payment deadline.
- **Base Rent Adjustment** — admins can update the monthly rental price per room.
- **Utility Invoice Dispatch** — admins input electricity and water amounts per occupied room and send billing invoices, which trigger tenant notifications.

#### 5. Payment & Billing System
- **Multi-Type Payments** — supports deposit (initial), rent (monthly), and utilities payment types.
- **Multi-Method Processing** — accepts GCash, Bank Transfer, and Cash payments. Cash payments require admin confirmation; digital payments auto-complete.
- **Dynamic Rent Lock** — prevents overpayment beyond the contract term or more than 1 month advance.
- **Combined Billing** — utility charges are bundled with rent payments on the tenant's bill pay interface.
- **Admin Payment Ledger** — filterable transaction history with time-based views and payment confirmation controls.

#### 6. Tenant Lifecycle Management
- **Active Tenants Board** — lists all current tenants with room assignment, contact info, and status.
- **Lease Extension** — tenants can extend their lease beyond the original contract term.
- **Lease Termination** — tenants can initiate a moveout request (sets status to `Pending Moveout`).
- **Tenant Archival** — admins archive departed tenants, which frees their room and moves their record to the past tenants list.
- **Past Tenants History** — archived tenant records with total payment summaries and individual transaction history drill-down.

#### 7. Announcement & Notification System
- **Admin Broadcast** — create announcements with audience targeting (`All`, `Tenants`, `Non-Tenants`, `Specific User`) and urgency tags (`General`, `Urgent`, `Reminder`).
- **Tenant Notification Feed** — real-time notification panel with unread count badge, mark-as-read, clear individual, read-all, and clear-all actions.
- **Notification Archive** — cleared notifications are moved to an archive view for later reference.
- **Automated Rent Reminders** — a background subsystem (6-hour interval) generates personalized reminders at 14, 7, 3, 2, and 1 day intervals before each tenant's billing cycle date.

#### 8. Dashboard & Analytics (Admin)
- **Revenue Statistics** — total revenue with monthly/yearly time-based filtering.
- **Occupancy Metrics** — active tenant count, occupancy rate percentage, occupied vs. vacant unit counts.
- **Application Summary** — counts of pending, accepted, and rejected applications.
- **Payment Overview** — pending vs. completed payment counts.
- **Monthly Revenue Chart Data** — 12-month revenue breakdown for the selected year.

### Screenshots of the Developed System

*— Screenshots omitted —*

---

# Conclusion and Future Improvements

### Summary of the Project

The **Apartment Management System (AMS)** successfully demonstrates the development of a full-stack web application using **Node.js**, **Express.js**, **EJS**, and **MongoDB**. The system addresses the core operational needs of apartment property management by providing:

- A **secure, role-based platform** where administrators and tenants interact through dedicated interfaces tailored to their responsibilities.
- A **complete rental lifecycle** from user registration, room browsing, and application submission through admin review, room assignment, payment processing, and eventual lease termination and archival.
- An **automated notification infrastructure** that keeps tenants informed of application decisions, payment confirmations, utility invoices, and upcoming rent deadlines without manual admin intervention.
- A **NoSQL database design** that leverages MongoDB's document model to represent complex entity relationships through ObjectId references while maintaining schema validation via Mongoose.

The project validates that MongoDB, combined with the Node.js ecosystem, is well-suited for building data-driven management applications where flexibility in document structure, ease of querying nested objects (such as utility sub-documents and uploaded document paths), and rapid prototyping are prioritized.

### Possible Enhancements

1. **Online Payment Gateway Integration** — Integrate a real payment API (e.g., PayMongo, Stripe) to enable actual digital payment processing instead of simulated GCash/Bank transactions.
2. **Email and SMS Notifications** — Implement the existing `channels` field in announcements to dispatch notifications via email (Nodemailer) and SMS (Twilio/Semaphore) in addition to in-app alerts.
3. **Maintenance Request Module** — Add a tenant-submitted maintenance/repair ticketing system with status tracking and admin assignment capabilities.
4. **Report Generation & Export** — Implement downloadable PDF/Excel reports for financial summaries, occupancy reports, and tenant histories.
5. **Image Gallery for Rooms** — Allow admins to upload room photos and display them in the tenant preview listings for better unit showcasing.
6. **Lease Contract PDF Generation** — Auto-generate formal lease agreement PDFs with tenant and room details for digital signing.
7. **Real-Time Updates with WebSockets** — Replace the polling-based notification system with Socket.io for instant push notifications and live dashboard updates.
8. **Multi-Property Support** — Extend the system to manage multiple apartment buildings under a single admin account with property-level filtering.
9. **Mobile-Responsive Progressive Web App (PWA)** — Convert the application into a PWA with offline capability and mobile push notifications for tenant convenience.
10. **Audit Logging & Activity Tracking** — Implement comprehensive logging of all admin actions (application decisions, payment confirmations, tenant archival) for accountability and dispute resolution.
