# Daily Records Backup

`daily-backup.gs` is a **Google Apps Script** that emails a full backup of all
travel records once a day to **hrservicedeliverypgb@gmail.com**.

It reads the live data from the app's cloud database (Firebase), so the backup
always matches what everyone sees in the web app. Each email includes:

- **CSV** — a spreadsheet-ready file of every record (opens in Excel/Sheets)
- **JSON** — the exact snapshot, usable to restore the data if ever needed
- A summary in the email body (total records, total cost, breakdown by status & process)

## Setup (one time, ~3 minutes)

1. Sign in to Gmail as **hrservicedeliverypgb@gmail.com**
2. Open <https://script.google.com> → **New project**
3. Delete the sample code, paste **all** of `daily-backup.gs`, click **Save**
4. In the function dropdown pick **`sendBackupNow`** → **Run**, and approve the
   permission prompt (it needs to fetch a URL and send email as you). A backup
   email arrives immediately.
5. Pick **`createDailyTrigger`** → **Run** once. This schedules the daily email.

## Changing things

| Want to… | Do this |
|---|---|
| Change recipient | Edit `RECIPIENT` at the top, save |
| Change time of day | Edit `TRIGGER_HOUR` (24-hour), save, re-run `createDailyTrigger` |
| Stop the daily email | Run `deleteDailyTrigger` |

## Why Apps Script (not the website)?

The app is a static site on GitHub Pages, which cannot run scheduled jobs or
send email. Apps Script runs on Google's servers under the HR Gmail account, so
no passwords or API keys are stored anywhere — it sends natively via Gmail.
