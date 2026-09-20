# Public Emotion Labeling Study

This version is designed for a real participant study:

**Vercel = public participant interface**  
**Supabase = database and secure random assignment**

Participants only need a normal web link. There is no localhost requirement.

## Study design elements

- Task pool: 100 tweets from `dair-ai/emotion`
- 100 tweets distributed as evenly as possible across the six emotions (17/17/17/17/16/16)
- Six worked examples are shown in the instructions and excluded from the task pool
- Each participant receives 5 random, distinct tweets
- The same participant ID always resumes the same five tweets
- The class distribution is: anger 17, fear 17, joy 17, love 17, sadness 16, surprise 16
- Every saved response records participant ID, tweet ID, chosen label, and timestamp
- Ground truth is stored in Supabase but is never returned to the participant-facing application
- Participants can revise an earlier answer by using the Previous button
- After all five answers are saved, the completion timestamp is recorded

## Files

```text
index.html                  Participant-facing site
styles.css                  Visual design
app.js                      Study logic
config.js                   Public Supabase URL + publishable key
supabase/schema.sql         Database tables, security, RPC functions
scripts/create_task_dataset.py
scripts/upload_task_dataset.py
scripts/requirements.txt
researcher_export.sql       Researcher-side results query
private/                    Generated task CSV lives here and is gitignored
```

# To recreate this study, follows these steps: 

## 1. Create a Supabase project

Create a Supabase project.

In the project's **SQL Editor**, paste and run:

```text
supabase/schema.sql
```

The schema gives the public browser no direct table access.
The public client can call only two database functions:

- `start_or_resume_study`
- `submit_annotation`

Neither function returns the hidden ground-truth label.

## 2. Create the 100-item task dataset locally

From the project root:

```bash
python -m venv .env
source .env/bin/activate
pip install -r scripts/requirements.txt
python scripts/create_task_dataset.py
```

This creates:

```text
private/task_dataset.csv
```

The file contains the ground-truth labels, so it is intentionally excluded
from Git by `.gitignore`.

The six public worked examples are also excluded before the 100 study items
are sampled.

## 3. Upload the task items to Supabase

Get the project URL from Supabase and a **secret** key from Supabase.

The secret key is researcher-only. NEVER put it in `config.js`, HTML,
JavaScript, or GitHub.

macOS/Linux:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SECRET_KEY="YOUR_SECRET_KEY"
python scripts/upload_task_dataset.py
```

The upload script sends the 100 rows to the private `study_items` table.

## 4. Configure the public browser client

Open `config.js` and replace:

```js
supabaseUrl: "PASTE_YOUR_SUPABASE_URL_HERE",
supabasePublishableKey: "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE",
```

with the project URL and **publishable** key from Supabase.

A publishable key is intended to be present in browser code. Its permissions
are limited by the database's grants/RLS and the RPC interface. Do not use a
secret/service-role key here.

## 5. Test locally before publishing

Given that this is a static site, any tiny static server will do:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

This local test is only for the researcher. Participants will use the
published Vercel Page URL.

Test with a fake participant ID such as:

```text
TEST01
```

Confirm:
1. Five tweets are shown.
2. Each selection saves.
3. Refreshing and re-entering `TEST01` resumes the same five tweets or if completed, then shows the study is completed
4. The completion page appears after five saved labels.

## 6. Publish with Vercel

Create a GitHub repository and place these project files at the repository root.

Commit and push the project:

```bash
git init
git add .
git commit -m "Create emotion labeling study"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Before pushing, run:

```bash
git status
```

and confirm that `private/task_dataset.csv` is **not** included. This file contains the hidden ground-truth labels and should remain private.

Next, deploy the repository with Vercel:

1. Go to [Vercel](https://vercel.com/) and sign in with your GitHub account.
2. Click **Add New → Project**.
3. Find and import the GitHub repository containing the emotion labeling study.
4. Keep the **Root Directory** set to the repository root (`./`).
5. Since this project is plain HTML, CSS, and JavaScript, no special framework configuration is required.
6. Click **Deploy**.
7. Wait until the deployment status shows that the site is ready.

Vercel will provide a public URL similar to:

```text
https://emotion-labeling-study.vercel.app
```

Open this URL yourself and complete one full test run before sharing it with participants.

Because the GitHub repository is connected to Vercel, future pushes to the production branch will automatically trigger a new deployment.

Once the production version has been tested successfully, give the Vercel URL to participants together with their assigned participant ID.


## 7. Export responses

Open the Supabase SQL Editor and run:

```text
researcher_export.sql
```

The result includes:

- participant ID
- assignment position
- tweet ID
- tweet text
- participant label
- ground truth
- whether the participant label matches ground truth
- assignment and response timestamps
- study start/completion timestamps

You can download the query result as CSV from Supabase.

## Participant IDs
anonymous codes such as the following will be used by participants before they enter the study:

```text
P001
P002
P003
```

Participants are asked to not enter your name, email address, or other identifying information.

## Important security rule

Safe in `config.js`:
- Supabase project URL
- Supabase publishable key

These are not public:
- Supabase secret key
- service-role key
- `private/task_dataset.csv`

The raw database tables are not granted to anonymous browser users. The site
uses narrow database functions instead, and the participant-facing function
does not return ground truth.
