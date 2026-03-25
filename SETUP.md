# EventSnap — Supabase Setup Guide

## Step 1 — Create Supabase Project

1. Go to https://supabase.com → "New Project"
2. Name it `eventsnap`, choose a region close to your users
3. Save the database password somewhere safe
4. Wait ~2 minutes for it to spin up

---

## Step 2 — Run the SQL Schema

1. In Supabase Dashboard → **SQL Editor** → **New Query**
2. Paste the entire contents of `schema.sql`
3. Click **Run**
4. You should see: `Success. No rows returned`

---

## Step 3 — Create the Storage Bucket

1. In Supabase Dashboard → **Storage** → **New Bucket**
2. Name: `event-photos`
3. ✅ Check **Public bucket** (guests need to view photos without auth)
4. Click **Save**

Then set the upload policy:
1. Click on the `event-photos` bucket → **Policies** tab
2. Click **New Policy** → **For full customization**
3. Policy name: `Allow public uploads`
4. Allowed operation: **INSERT**
5. Target roles: leave blank (applies to everyone including anon)
6. Policy definition:
   ```sql
   bucket_id = 'event-photos'
   ```
7. Click **Review** → **Save policy**

(Public read is already enabled because the bucket is public)

---

## Step 4 — Get Your API Keys

1. Supabase Dashboard → **Project Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
   - **anon public** key → this is your `VITE_SUPABASE_ANON_KEY`

---

## Step 5 — Add Env Vars to Netlify

1. In Netlify Dashboard → your site → **Site configuration** → **Environment variables**
2. Click **Add a variable** for each:

   | Key                    | Value                          |
   |------------------------|--------------------------------|
   | `VITE_SUPABASE_URL`    | `https://xxxx.supabase.co`     |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` (your anon key) |

3. Click **Save**

---

## Step 6 — Deploy

1. Copy the updated files into your repo:
   - `src/supabase.js`  (new file)
   - `src/store.js`     (new file)
   - `src/App.jsx`      (updated)
   - `package.json`     (updated — adds @supabase/supabase-js)

2. Push to GitHub:
   ```bash
   git add .
   git commit -m "Add Supabase backend"
   git push
   ```

3. Netlify will auto-deploy. Watch the build log — it should complete in ~60 seconds.

---

## Step 7 — Test the full flow

1. Open `https://eventsnapapp.live` → Create Event → fill in form → submit
2. You should land on the Dashboard with a QR code
3. Copy the **guest link** or event code
4. Open an incognito window (or different device) → paste the link or enter the code
5. Upload a photo
6. Go back to the host dashboard → Gallery tab → your photo should appear ✅

---

## File Structure After Update

```
src/
├── supabase.js    ← NEW: Supabase client init
├── store.js       ← NEW: All DB + Storage operations  
├── App.jsx        ← UPDATED: imports from store.js, hash routing, real URLs
└── main.jsx       ← unchanged
```

---

## How the QR Code Works Now

QR codes now encode a real URL:
```
https://eventsnapapp.live/#/event/A3BX9K2M
```

When a guest scans:
- Their browser opens the URL
- App detects `/#/event/A3BX9K2M` in the hash
- Automatically fetches the event from Supabase
- Opens the gallery immediately — no code entry needed

---

## Troubleshooting

**"Missing Supabase env vars" error on deploy**
→ Check Netlify env vars are saved and trigger a redeploy

**"Upload failed: row-level security"**  
→ Make sure you ran the full `schema.sql` including the RLS policies

**"Event not found" after creating**
→ Check Supabase → Table Editor → events table has a row with your code

**Photos not showing**
→ Check Supabase → Storage → `event-photos` bucket exists and is public
→ Check the `photos` table has rows with valid `image_url` values
