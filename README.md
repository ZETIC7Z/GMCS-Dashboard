# FY26 GMCS Training Compliance Dashboard

A premium, interactive training compliance tracking dashboard for the Accenture GMCS Philippines team. Built with vanilla HTML/JS, Node.js API routes, and Vercel Blob storage.

🌐 **Production URL:** [GMCS-Dashboard.vercel.app](https://gmcs-dashboard.vercel.app)

---

## ✨ Features & Enhancements

### 1. 🖥️ Edge-to-Edge Premium Layout
- **Full Width Design:** The dashboard layout is stretched edge-to-edge (`max-width: 100%`), fully utilizing screen estate without wasted side margins.
- **Responsive Adaptations:** Fully optimized for mobile, tablet, and desktop viewports. Table items, interactive cards, and headers automatically adapt to prevent overflow.

### 2. 🎨 Aesthetic Light/Dark Theme Switching
- **Sliding Sun/Moon Toggle:** Features a smooth sliding toggle switch synced between the main dashboard and the admin panel.
- **Theme Persistence:** Stores selections in `localStorage` to preserve the user's theme preference across visits and pages.
- **Automated Text Contrast:** Automatically toggles contrasting text colors (dark/light) to maintain peak readability.

### 3. 🔐 Secure Admin Authentication & Session Management
- **Credentials:** Protected by environment-controlled login credentials (`ADMIN_USER=admin` and `ADMIN_PASSWORD=#Luna1996!`).
- **Show/Hide Password:** Interactive eye icon toggles password visibility during input.
- **Inactivity Session Lock:** Monitors user interactions (mouse, keyboard, scroll, touch). If idle for 1 hour, the session is cleared, sensitive statistics are hidden, and the user is redirected to the secure login prompt.
- **High-Tech Toast & Timezone Greetings:** A smooth glassmorphism toast popup displays timezone-aware greetings for Admin Reah on login ("Welcome back, Admin Reah. Good morning...") and logout ("Goodbye, Admin Reah...").

### 4. 🕒 Recent Upload Activities Log
- **Activity Store:** Log uploads persistently on both local (`data/activities.json`) and Vercel Blob storage.
- **Selective Deletion:** View all recent uploads in a structured table. Select items individually or use the "Select All" checkbox.
- **Double-Confirmation Modal:** Custom-designed alert window with custom warning prompts:
  - If a subset is selected: `"ARE YOU SURE TO CLEAR THIS {N} RECENT LOGS YOU SELECTED?"`
  - If all are selected: `"ARE YOU SURE TO CLEAR ALL YOUR RECENT ACTIVITY LOGS?"`

### 5. 👥 Visitor Geolocation Analytics
- **Visit Tracking:** Automatically logs client IP address, timestamp, country code, and city name on dashboard loading.
- **IP Resolution:**
  - **On Vercel:** Detects geo headers (`x-real-ip`, `x-vercel-ip-country`, `x-vercel-ip-city`) natively.
  - **Locally:** Queries `ip-api.com` for public IPs, mapping loopback and local subnets to `PH (Local Dev)`.
- **Analytics Dashboard:** Renders metric cards for **Total Views** and **Unique Visitors** (deduplicated by IP) along with scrollable visitor lists showing country flag emojis.

---

## 🗂️ Project Structure

```
gmcs-dashboard/
├── index.html            ← Main dashboard (5 tabs, filters, charts, theme toggle)
├── admin.html            ← Admin profile header, upload zones, analytics tables
├── server.js             ← Local dev server (mirrors Vercel serverless routing)
├── admin-photo.png       ← Admin profile portrait
├── logo.png              ← Site brand logo (favicon, headers, loading screen)
├── api/
│   ├── login.js          ← Vercel function: Authenticates admin credentials
│   ├── upload.js         ← Vercel function: Parses Excel & updates Vercel Blob JSON
│   ├── data.js           ← Vercel function: Returns compliance JSON & logs visits
│   ├── activities.js     ← Vercel function: Retrieves and clears activities log
│   └── visits.js         ← Vercel function: Retrieves visitor geo-statistics
├── data/                 ← Generated locally on first upload (ignored in git)
│   ├── dashboard-data.json
│   ├── activities.json
│   └── visits.json
├── package.json          ← Node dependencies and script config
├── vercel.json           ← Vercel routing rules (configured for filesystem static assets)
├── .gitignore            ← Ignores node_modules, .env, and local data directory
├── .env.example          ← Template for environment variables
└── README.md             ← GitHub repository documentation
```

---

## 📁 Required Excel Files

The admin upload page expects exactly these 3 SharePoint export files:

| Field | File | Description |
|-------|------|-------------|
| **tracker** | `FY26_GMCS_Compliance_Mandatory_Tracker_extraction.xlsx` | Completion records — columns: `Enterprise ID`, `Status`, `Ethics & Compliance Trainings`, `IS Advocate Training`, `Survey`, `Workday`, `GEN AI ` |
| **roster** | `FY26_GMCS_Roster_List_.xlsx` | Employee master list — columns: `Enterprise ID`, `Resource Status`, `GMCS Project`, `Management Level`, `PH Location `, `Manager/POC` |
| **mandatory** | `Mandatory___Compliance_List_for_FY26.xlsx` | Training list — columns: `Title`, `Category`, `Trainings Sub Category` |

The files can be renamed — what matters is the **column headers** inside, which must match the above.

---

## 💻 Running Locally

### Prerequisites

- **Node.js 18+** — download from [nodejs.org](https://nodejs.org)
- The 3 Excel export files from SharePoint

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
ADMIN_USER=admin
ADMIN_PASSWORD=#Luna1996!
PORT=3000
```

### 3. Start the local server
```bash
npm run dev
# or
node server.js
```
The server will start at `http://localhost:3000`.

### 4. Upload your data & view dashboard
1. Go to `http://localhost:3000/admin`
2. Enter the username and password (`admin` / `#Luna1996!`)
3. Select or drag-and-drop the 3 required Excel files
4. Click **"Upload & Update Dashboard"**
5. View the dashboard at `http://localhost:3000`

---

## 🌐 Deploying to Vercel

### 1. Push to GitHub
Commit your changes and push them to your repository (e.g. `GMCS-Dashboard`):
```bash
git init
git add .
git commit -m "Configure production release"
git remote add origin https://github.com/YOUR_USERNAME/GMCS-Dashboard.git
git push -u origin main
```

### 2. Import into Vercel
1. Log into your Vercel Dashboard and click **"Add New Project"**.
2. Select your imported GitHub repository.
3. Under **Environment Variables**, add:
   - `ADMIN_USER` = `admin`
   - `ADMIN_PASSWORD` = `#Luna1996!`
4. Click **"Deploy"**.

### 3. Attach Vercel Blob Storage
1. Navigate to the **Storage** tab in your Vercel project panel.
2. Select **Create Database** → **Blob** → **Create**.
3. Name it and click **Connect to Project**. Vercel will inject `BLOB_READ_WRITE_TOKEN` automatically.
4. Redeploy your project.

### 4. Access URLs
- Dashboard: `https://gmcs-dashboard.vercel.app`
- Admin Panel: `https://gmcs-dashboard.vercel.app/admin`

---

## 🔧 Technical Notes

### Vercel Routing Configuration
In `vercel.json`, we configure `{ "handle": "filesystem" }` at the beginning of the `routes` array. This informs Vercel to serve static assets like `/logo.png`, `/admin-photo.png`, and `/favicon.ico` directly from the directory without triggering index rewrites, ensuring all visual elements render correctly.

---

*FY26 GMCS Training Compliance Dashboard · Accenture GMCS Philippines*
