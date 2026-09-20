# 🏥 Nowshera Family Clinic

## Clinic Appointment & Patient Management System

A modern web-based **Clinic Appointment and Patient Management System** designed to simplify appointment booking, doctor scheduling, patient management, and clinic administration.

The system provides separate dashboards for **Patients, Doctors, and Administrators**, with appointment validation, role-based access, automated notifications, and secure data management.

---

## 🚀 Project Overview

Nowshera Family Clinic replaces manual appointment management through phone calls, WhatsApp messages, and paper records with a centralized digital system.

Patients can request appointments based on available 30-minute slots, doctors can manage appointments and visit records, and administrators can manage doctors, patients, and overall clinic operations.

### Main Goals

* Simplify appointment booking
* Prevent appointment conflicts and double-booking
* Manage doctor schedules and leaves
* Provide role-based access
* Maintain patient appointment history
* Automate appointment notifications
* Provide an administrative dashboard

---

## 👥 User Roles

### 👤 Patient

Patients can:

* Create an account and sign in
* View available doctors and specialties
* View available appointment slots
* Request appointments
* View appointment status
* Cancel appointments
* Reschedule appointments
* View permitted visit notes
* View their appointment history

### 👨‍⚕️ Doctor

Doctors can:

* Sign in securely
* Manage their working schedule
* View pending appointment requests
* Confirm or reject appointments
* View their appointment schedule
* View patient appointment history
* Mark appointments as Completed
* Mark appointments as No-show
* Add and update visit notes

### 👨‍💼 Administrator

Administrators can:

* Manage doctors
* Activate/deactivate doctors
* View and search patients
* View all appointments
* Filter appointments by doctor, date, and status
* Cancel appointments
* View clinic dashboard statistics
* View appointment counts per doctor

Administrators **cannot access patient visit-note content**.

---

## 📅 Appointment Management

The system follows several important appointment rules:

* Appointments are divided into **30-minute slots**
* A doctor cannot have two active appointments at the same time
* A patient cannot have two appointments at the same time
* Requested appointments initially have **Pending** status
* Doctors can confirm or reject pending requests
* Patients can cancel or reschedule up to **2 hours before** the appointment
* Past appointment times cannot be booked
* Appointments outside doctor working hours cannot be booked
* Appointments during doctor leave cannot be booked
* Pending appointments that are not confirmed before their start time are automatically cancelled
* Completed and No-show statuses can only be applied after the appointment start time

---

## 🔐 Role-Based Access & Security

The system uses authentication and database-level security to protect user data.

Access is separated according to user role:

```text
Patient
   ↓
Own appointments
Own permitted visit notes

Doctor
   ↓
Assigned appointments
Assigned patients
Own visit notes

Admin
   ↓
Doctors
Patients
Appointments
Dashboard statistics
   ✕ Visit note content
```

Supabase Row Level Security (RLS) is used to control database access.

---

## 🤖 Automation with n8n

The project integrates **n8n** for workflow automation.

### Appointment Confirmation

When a doctor confirms an appointment:

```text
Doctor confirms appointment
        ↓
Supabase appointment updated
        ↓
Backend sends webhook to n8n
        ↓
n8n receives appointment data
        ↓
Email notification sent
        ↓
Patient receives confirmation
```

The confirmation email includes:

* Patient name
* Doctor name
* Appointment date
* Appointment time
* Appointment ID

---

## 🗄️ Database

The project uses **Supabase PostgreSQL**.

Main tables include:

* `profiles`
* `specialties`
* `doctors`
* `doctor_working_hours`
* `doctor_leaves`
* `appointments`
* `visit_notes`

The database also contains constraints and indexes to help prevent appointment conflicts and maintain data integrity.

---

## 🛠️ Technologies Used

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Node.js
* Express
* TypeScript

### Database & Authentication

* Supabase
* PostgreSQL
* Supabase Authentication
* Row Level Security (RLS)

### Automation

* n8n
* Webhooks
* Email automation

### Testing

* Postman
* TypeScript build checks
* Appointment validation testing

### Development

* Google AI Studio
* GitHub

---

## 🧪 Validation & Testing

The application was tested against important business rules, including:

* ✅ Appointment double-booking prevention
* ✅ Same patient cannot book two doctors at the same time
* ✅ Past-date booking prevention
* ✅ Outside-working-hours validation
* ✅ Inactive doctor validation
* ✅ Doctor leave handling
* ✅ Appointment cancellation cutoff
* ✅ Appointment rescheduling
* ✅ Pending appointment expiration
* ✅ Completed appointment validation
* ✅ No-show validation
* ✅ Doctor/patient appointment privacy
* ✅ Visit-note access control
* ✅ Admin restriction from visit-note content
* ✅ Appointment confirmation email automation

---

## 📂 Project Structure

```text
Clinic-Appointment-Confirmation/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── lib/
│   ├── types/
│   └── ...
│
├── supabase/
│   └── migrations/
│
├── server.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
├── README.md
└── ...
```

---

## 🌍 Timezone Handling

The clinic uses:

**Asia/Karachi (Pakistan Standard Time)**

Appointments are stored in UTC in the database and converted to Pakistan Standard Time when displayed to users.

This keeps appointment times consistent between the frontend, backend, database, and automation workflows.

---

## 🎯 Future Improvements

Possible future improvements include:

* SMS/WhatsApp notifications
* Online payment integration
* Prescription management
* Lab report management
* Video consultations
* Advanced analytics
* Multiple clinic branches
* Mobile application
* Additional automated reminder workflows

---

## 📌 Project Status

**Status: Completed**

This project was developed as part of an AI automation/software development learning project and demonstrates the integration of:

**Frontend + Backend + Database + Authentication + Automation**

---

## 👨‍💻 Developer

**Aqib Javed**

Built with **React, TypeScript, Node.js, Express, Supabase, PostgreSQL, n8n, and Google AI Studio**.

---

## ⭐ Acknowledgement

This project was developed as a practical learning project to understand modern web application development, database management, authentication, API integration, automation workflows, and role-based access control.
