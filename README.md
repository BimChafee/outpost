# Temporary Mining Outpost

House app for the roommates at 582 Rapids Lane: shared grocery list, bill splitting with receipt scanning, upkeep timers, and a bin-night reminder the evening before collection.

It's an installable web app (PWA). Chrome on Android installs it like a normal app: home-screen icon, full screen, works offline, push notifications. No app store or APK build needed.

```
app/                 the app (static files, no build step) - this folder is what gets hosted
  config.js          Firebase + Web Push settings  <- you edit this
  data/schedule.json Peel collection calendar for 582 Rapids Lane (bundled fallback)
  tests.html         open in a browser to run the logic tests
notifier/notify.py   nightly job: Peel's live calendar; pushes for bin night, rent, house events, upkeep
.github/workflows/   pages.yml (hosting) and notify.yml (nightly reminders)
firestore.rules      database security rules
```

## What each part does

- **Groceries.** One shared list, live for everyone. Type `2 milk, eggs` to add several at once, or tap the pencil to add with details: quantity, notes, categories, stores, who it's for, and an optional heads-up to roommates. Tick the circle when you've **got it for now**; it parks under *Ready to add back*, and one tap puts it back next time. Tap the double tick when it's **bought for good**; it goes to *Purchase history*, which clears itself after 60 days. *Delete* (in the ⋯ menu) is for typos and leaves no history. Adding something that's already on the list asks whether to bump the quantity. *View options* has sections (by category, store or person), sort (your own drag order, name, or newest) and filters, and search covers names and notes. Everything has Undo.
- **Bills.** A spreadsheet of every bill: one column per roommate, plus balances and the fewest e-Transfers needed to settle up. A bill splits evenly, by shares (e.g. 1.5 shares of rent for the big room), or by item. By item, you tap squares to put each item on one or more people. Tax, tip and discounts are spread in proportion to what each person bought.
- **Receipt scanning.** Tap the big Scan button. The app opens its own camera, so Android can't unload it mid-scan; take several photos for a long receipt, or pick one from the gallery. It finds the store, date, items, tax and total, then checks the items add up to the receipt's subtotal and tells you if they don't. By default it reads on the phone (free; the first scan downloads the reader, ~20 s). Paste an Anthropic API key in Settings and Claude reads it instead, which is more accurate on long or crumpled receipts. Each scan costs a few cents, and the key stays on that phone.
- **Upkeep.** Repeating jobs with a timer: furnace air filter every 90 days, plus suggestions like the smoke alarm test and fridge water filter. Tap "Done today" to restart the timer. Reminders go out the night before a job is due, and every third day while it's overdue.
- **Calendar.** A shared calendar laid out like a crew roster: days across, one lane per roommate, and a House lane in hazard tape for parties, guests, contractor visits and house meetings. Bin days, rent and upkeep due dates appear in the House lane on their own. Tap names to show or hide schedules (or *Just me*). Events can be work or class, away, plans, appointments or quiet-please; they can repeat (daily, weekly, every 2 weeks, monthly) and you can skip one date. Overnight shifts and multi-day trips are drawn as one bar. House events have RSVP, and the day view says who's home tonight. Week, Month and List views; swipe the board to change weeks. Home shows *Today*, and the nightly reminder includes tomorrow's house events.
- **Rent and address.** Home and Bills always show the house plate: 582 Rapids Lane, L5G 0A9, and rent (,000 on the 1st) with a countdown. The nightly reminder says when rent is due tomorrow. Change the amount, due day or postal code in Settings.
- **Themes.** Settings > Look restyles the whole app, per phone. *Outpost* is the site-safety look, in light, dark or matching the phone. *Old School* (RuneScape stone panels and parchment), *Lich King* (Wrath of the Lich King frost and gold), *Persona* (Persona 5 red, black and white), *Moonring* (the key art's neon line art; its moon row lights the real moon phase), and *Cyberpunk* (inspired by [pathumd/2021_personal_site](https://github.com/pathumd/2021_personal_site), a Cyberpunk 2077 tribute) is neon yellow, cyan and red on a night skyline, with cut-corner panels, glitching buttons and scanlines. Colours keep their meaning in every theme. To add a theme: copy `app/theme-cyber.css`, scope it to a new `[data-skin="…"]`, add the skin to `SKINS` in `app/js/theme.js` and link the file in `index.html`.
- **Bins.** The home screen shows the next collection and the four after it. Each evening the notifier pushes "Bins out tonight" if tomorrow is collection day.

### About the garbage schedule

These facts come from Peel's ReCollect calendar for this address, checked Oct 28 2026:

- Collection is on **Monday**. In holiday weeks it moves later.
- **Organics every week.** **Garbage every other week**; the next garbage days are Nov 9 and Nov 23.
- **Recycling** has been collected by Circular Materials since Jan 2026, on "the same schedule". The app treats the non-garbage weeks as recycling weeks. If the first few weeks don't match, tell me and I'll change the rule in `schedule.js` / `notify.py`.
- **Yard waste** is seasonal and comes from the calendar.
- Peel has only published dates to early January 2027. After that the app estimates the dates and labels them "est.". When Firebase is set up, the notifier refreshes the real calendar into the app every night.
- Mississauga takes over waste collection from Peel in **October 2027** and may change collection days. When that happens, the ReCollect place ID in `notify.py` may need updating.

## Setup

Work through these steps in order; together they take about 30 minutes. Everything runs on free tiers: GitHub Pages, Firebase Spark plan and GitHub Actions.

### 1. Put it on GitHub (hosting)

1. Create a GitHub repository, e.g. `outpost`. GitHub Pages is free for **public** repos. The code holds no secrets: household data lives in Firebase behind a code that isn't in the repo.
2. From this folder:
   ```
   git init -b main
   git add .
   git commit -m "Outpost house app"
   git remote add origin https://github.com/<you>/outpost.git
   git push -u origin main
   ```
3. Repo **Settings > Pages > Build and deployment > Source: GitHub Actions**. The "Deploy app" workflow publishes `app/` to `https://<you>.github.io/outpost/`.

At this point the app works on a single phone (data stays on that phone). Steps 2 and 3 make it shared and turn on notifications.

### 2. Firebase (sharing between phones + push)

1. Go to https://console.firebase.google.com, **Add project** (Analytics not needed).
2. **Build > Authentication > Get started > Sign-in method > Anonymous > Enable.**
   Under **Settings > Authorized domains**, add `<you>.github.io`.
3. **Build > Firestore Database > Create database**, in production mode. A Toronto location (`northamerica-northeast2`) is fine.
   On the **Rules** tab, paste in `firestore.rules` and click **Publish**.
4. **Project settings (gear) > General > Your apps > Web (</>)**. Register an app and copy the `firebaseConfig` object into `app/config.js` as `firebase: { ... }`.
5. **Project settings > Cloud Messaging > Web Push certificates > Generate key pair.** Copy the key into `app/config.js` as `vapidKey: "..."`.
6. Commit and push. The site redeploys in about a minute.

The Firebase web config is meant to be public, so it's fine in the repo.

### 3. Install on everyone's phone

1. Open `https://<you>.github.io/outpost/` in **Chrome on Android**.
2. Chrome menu (⋮) > **Install app** (or **Add to Home screen**).
3. The first person taps **Start a household** and enters everyone's names. Then **Settings > Share invite link** and send it to the group chat. Roommates open the link, tap **Join household** and pick their name.
4. Everyone: **Settings > Turn on notifications**.

### 4. Nightly reminders (GitHub Actions)

1. Firebase **Project settings > Service accounts > Generate new private key**. A JSON file downloads. **Don't commit it.**
2. In the GitHub repo go to **Settings > Secrets and variables > Actions > New repository secret** and add:
   - `FIREBASE_SERVICE_ACCOUNT`: the entire contents of that JSON file
   - `HOUSEHOLD_ID`: the household code from the app's Settings screen
   - `NTFY_TOPIC` (optional): see below
3. **Actions > Nightly reminders > Run workflow**, with "force" ticked, to send a test right away. The log shows what it sent. If tomorrow isn't collection day and nothing is due, it says "nothing to send tonight".

The workflow runs at about 7 p.m. Toronto time every night and sends at most one notification. GitHub pauses scheduled workflows after 60 days with no commits to the repo and emails you first. Re-enable it from the Actions tab, or push any small change.

**Alternative without Firebase push: ntfy.** Install the free *ntfy* app on each phone and subscribe to a hard-to-guess topic name like `outpost-582-rapids-k3x9`. Add that name as the `NTFY_TOPIC` secret. Bin-night reminders then work even before Firebase is set up; upkeep reminders still need Firebase.

## Optional: a real APK

If you want an `.apk` file instead of installing from Chrome, go to https://www.pwabuilder.com and enter the app URL. Choose **Android > Generate**. It wraps the app as a Trusted Web Activity and gives you a signed APK to sideload. Everything above still applies.

## Developing

- Run locally: `python -m http.server 8000` in `app/`, then open http://localhost:8000. Push needs HTTPS, but everything else works on localhost.
- Logic tests: open http://localhost:8000/tests.html. They cover split math, balances, settle-up, schedule inference and receipt parsing.
- Notifier dry run: `pip install -r notifier/requirements.txt`, then `DRY_RUN=1 FORCE=1 python notifier/notify.py`.
- After changing app files, bump `VERSION` in `app/sw.js` so phones pick up the new version.
- Libraries load from pinned CDN URLs (Preact+htm 3.1.1, Firebase 12.19.0, Tesseract.js 7.0.0, Anthropic SDK 0.133.0) and are cached for offline use.
