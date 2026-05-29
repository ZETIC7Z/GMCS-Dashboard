# FY26 GMCS Training Compliance Dashboard

A live compliance tracking dashboard for the Accenture GMCS Philippines team.  
Built with vanilla HTML/JS (no framework), Node.js API routes, and Vercel Blob storage.

---

## 📋 What This Project Does

| URL | Purpose |
|-----|---------|
| `/` | **Main Dashboard** — view live compliance data, filter by manager/project/training |
| `/admin` | **Admin Upload Page** — upload 3 Excel files to update dashboard data |
| `/api/data` | **API** — returns the latest processed compliance JSON |
| `/api/upload` | **API** — accepts Excel files, processes them, saves result |

### How Data Flows

```
Admin uploads 3 Excel files at /admin
         ↓
POST /api/upload  (server-side Node.js)
         ↓
Parses Excel with SheetJS → builds compliance JSON
         ↓
Local:   saves to  ./data/dashboard-data.json
Vercel:  saves to  Vercel Blob Storage (persistent, globally available)
         ↓
GET /api/data  → returns that JSON
         ↓
Main dashboard at /  fetches /api/data on load → renders instantly
         ↓
Every visitor sees the latest data — no manual refresh needed
```

---

## 🗂️ Project Structure

```
gmcs-dashboard/
├── index.html          ← Main dashboard (5 tabs, filters, charts)
├── admin.html          ← Upload page for new Excel exports
├── server.js           ← Local dev server (mirrors Vercel routing)
├── api/
│   ├── upload.js       ← POST handler: parse Excel → save JSON
│   └── data.js         ← GET handler: return saved JSON
├── data/               ← Created automatically on first upload (local only)
│   └── dashboard-data.json
├── package.json
├── vercel.json         ← Vercel routing config
├── .gitignore
├── .env.example        ← Template for environment variables
└── README.md
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

### Step 1 — Install dependencies

```bash
npm install
```

This installs `xlsx` (Excel parser) and `@vercel/blob` (used by Vercel deployment).

### Step 2 — Start the local server

```bash
npm run dev
# or
node server.js
```

You should see:

```
╔══════════════════════════════════════════════════════════╗
║   GMCS FY26 Compliance Dashboard — Local Dev Server     ║
╠══════════════════════════════════════════════════════════╣
║   Dashboard:  http://localhost:3000                      ║
║   Admin:      http://localhost:3000/admin                ║
║   Data API:   http://localhost:3000/api/data             ║
╚══════════════════════════════════════════════════════════╝
```

### Step 3 — Upload your data

1. Open **http://localhost:3000/admin** in your browser
2. Upload all 3 Excel files (click each card or drag-and-drop)
3. Click **"Upload & Update Dashboard"**
4. Wait for the green success message (~5–10 seconds)

### Step 4 — View the dashboard

Open **http://localhost:3000** — you'll see the full compliance dashboard with your real data.

### Updating data locally

Repeat Step 3 any time you have new Excel exports. The data file at `./data/dashboard-data.json` is overwritten with the latest data. The dashboard reflects the new data on the next page load.

---

## 🌐 Deploying to Vercel

### Option A — GitHub + Vercel (Recommended — Auto-deploys on every push)

#### 1. Push to GitHub

```bash
# Inside the project folder
git init
git add .
git commit -m "Initial commit — GMCS compliance dashboard"

# Create a new repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/gmcs-dashboard.git
git push -u origin main
```

#### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Click **"Import Git Repository"** → select your GitHub repo
4. Leave all build settings as default (no framework, no build command)
5. Click **"Deploy"**

#### 3. Set up Vercel Blob Storage

Vercel Blob is where the uploaded data is stored persistently (replaces `./data/` from local dev).

1. In your Vercel project → click **"Storage"** tab
2. Click **"Create Database"** → choose **"Blob"**
3. Name it `gmcs-data` → click **"Create"**
4. Click **"Connect to Project"** → select your project
5. Vercel automatically adds `BLOB_READ_WRITE_TOKEN` to your environment variables

#### 4. Redeploy

After connecting Blob storage, trigger a redeploy:

```bash
# Make any small change and push, or use Vercel dashboard → Deployments → Redeploy
git commit --allow-empty -m "Connect blob storage"
git push
```

#### 5. Your live URLs

```
https://your-project.vercel.app/       ← Main dashboard
https://your-project.vercel.app/admin  ← Admin upload page
```

---

### Option B — Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (will prompt for login)
vercel --token YOUR_VERCEL_TOKEN

# Or deploy to production directly
vercel --prod --token YOUR_VERCEL_TOKEN
```

Then add Blob storage from the Vercel dashboard (same Step 3 above).

---

## 🔄 Updating Data on Live Vercel Site

1. Export fresh files from SharePoint
2. Go to `https://your-project.vercel.app/admin`
3. Upload the 3 new Excel files
4. Click **"Upload & Update Dashboard"**
5. Done — all visitors to `/` now see the updated data immediately

No redeployment needed. No code changes needed. The data is stored in Vercel Blob and served globally.

---

## 🗺️ Dashboard Features

### Main Dashboard (`/`)

**Filter Bar**
- Filter by **Manager/POC** — dropdown with all managers
- Filter by **GMCS Project Team** — dropdown with all 28 projects
- **Search** by Enterprise ID
- All filters apply across every tab simultaneously

**Tabs**

| Tab | What it shows |
|-----|---------------|
| 📊 Overview | Category compliance bar chart, overall status donut, category cards with per-training non-compliant EID lists |
| 👤 By Manager | Card per manager showing % compliance per category. Switch training dropdown to see exact non-compliant EIDs under that manager for a specific training |
| 📁 By Project | Same as By Manager but grouped by GMCS project team |
| 📚 By Training | Select any training → bar charts by manager + by project + full Manager × Training heatmap |
| 👥 All Employees | Full paginated table with compliance ✓/✗ per category, filterable by compliance status |

**Training Categories**
- ⚖️ Ethics & Compliance (4 trainings)
- 🔐 IS Advocate (2 trainings)
- 🤖 Gen AI (4 trainings)
- 📋 Survey (3 trainings)
- 💼 Workday (2 trainings)

---

## 🔧 Technical Notes

### Why no framework?

The dashboard is pure HTML + vanilla JS + Chart.js. This means:
- No build step required
- Single `index.html` file = easy to deploy anywhere
- Works offline (once data is loaded)
- No npm vulnerabilities from UI framework

### Local vs Vercel data storage

| Environment | Storage | Location |
|-------------|---------|----------|
| Local dev | File system | `./data/dashboard-data.json` |
| Vercel | Vercel Blob | Cloud, globally distributed |

The API files (`api/upload.js`, `api/data.js`) use `@vercel/blob` for Vercel.  
The local `server.js` uses Node.js `fs` module instead.

### Security note

The `/admin` route has no authentication in this version. If you want to restrict access:
- Add a simple password prompt in `admin.html`
- Or use Vercel's [Password Protection](https://vercel.com/docs/security/deployment-protection) feature (Pro plan)

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Make sure Node.js 18+ is installed: `node --version` |
| Dashboard shows "No data uploaded yet" | Go to `/admin` and upload your 3 Excel files |
| Upload fails with "Missing files" | Make sure all 3 files are selected before clicking Upload |
| Upload fails with "No boundary" | Try a different browser (Chrome recommended) |
| Vercel deploy shows 404 on `/admin` | Check `vercel.json` is in the project root and contains the `/admin` route |
| Blob storage error on Vercel | Make sure `BLOB_READ_WRITE_TOKEN` is set in Vercel Environment Variables |
| Column not found error | Check that your Excel files have the correct column headers (see Required Excel Files above) |

---

## 📞 Support

This dashboard was built for the Accenture GMCS Philippines compliance team.  
For issues or feature requests, contact the project maintainer.

---

*FY26 GMCS Training Compliance Dashboard · Accenture GMCS Philippines*
