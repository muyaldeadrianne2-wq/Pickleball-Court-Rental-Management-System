# Courtly – Pickleball Court Rental Management System

Converted from Java Spring Boot to **React.js + Vite + Node.js + Express + MongoDB**. No Java or Maven is required. The frontend uses React, JSX, HTML, CSS and JavaScript; JSON is used for API data.

## Requirements
- Windows 10/11
- Node.js LTS (includes npm)
- MongoDB Community Server running locally, or MongoDB Atlas URI

## 1. Start MongoDB
Make sure your MongoDB service is running. Default database: `pickleball_db`.

## 2. Configure the backend
Open PowerShell in the project folder, then run:

```powershell
cd backend
copy .env.example .env
npm install
npm run dev
```

The backend runs at `http://localhost:5000`. Edit `backend/.env` if your MongoDB connection string is different. Set a long random `JWT_SECRET` before deployment.

## 3. Start the React frontend
Open a second PowerShell window in the project folder:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. Vite forwards `/api` requests to the Express server.

## Default administrator
- Email: `admin@pickleball.local`
- Password: `Admin123!`

The backend creates this administrator and two sample courts on first startup. Change the default administrator password before using the system beyond local testing.

## Included features
- Customer registration and login (bcrypt password hashing + JWT authentication)
- Admin and customer dashboards
- Court listing and admin court CRUD
- Court reservations with date, time, hourly rate and overlap validation
- Customer booking history and cancellation
- Admin booking approval/status and payment-status management
- Admin customer list and dashboard statistics
- MongoDB persistence

## Notes
- Payment is a status record only; no payment gateway or real-money processing is connected.
- The overlap check is suitable for a single local server instance. For production or multiple server instances, use a MongoDB transaction/locking strategy to prevent simultaneous conflicting reservations.
- Keep `.env` private and do not commit it.
