# Public Emotion Labeling Study

This version is designed for a real participant study:

**Vercel = public participant interface**  
**Supabase = persistent database + secure random assignment**

Participants only need a normal web link. There is no localhost requirement.

## Study behavior

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

## 1. Create a Supabase project

Create a Supabase project.

In the project's **SQL Editor**, paste and run:

```text
supabase/schema.sql
```

The schema intentionally gives the public browser no direct table access.
The public client can call only two database functions:

- `start_or_resume_study`
- `submit_annotation`

Neither function returns the hidden ground-truth label.

## 2. Create the 100-item task dataset locally

From the project root:

```bash
python -m venv .venv
source .venv/bin/activate
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

Get your project URL and a **secret** key from Supabase.

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
are limited by the database's grants/RLS and the RPC interface. Never use a
secret/service-role key here.

## 5. Test locally before publishing

Because this is a static site, any tiny static server is enough:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

This local test is only for the researcher. Participants will use the
published GitHub Pages URL.

Test with a fake participant ID such as:

```text
TEST01
```

Confirm:
1. Five tweets are shown.
2. Each selection saves.
3. Refreshing and re-entering `TEST01` resumes the same five tweets.
4. The completion page appears after five saved labels.

## 6. Publish with GitHub Pages

Create a GitHub repository and place these project files at the repository root.

Commit and push:

```bash
git init
git add .
git commit -m "Create emotion labeling study"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

On GitHub:

1. Open the repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`.
5. Save.

GitHub will show the public study URL. Give that URL to participants.

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

Assign anonymous codes such as:

```text
P001
P002
P003
```

Do not ask participants to type their names or email addresses unless your
study protocol specifically requires identifiable data.

## Important security rule

Safe in `config.js`:
- Supabase project URL
- Supabase publishable key

Never public:
- Supabase secret key
- service-role key
- `private/task_dataset.csv`

The raw database tables are not granted to anonymous browser users. The site
uses narrow database functions instead, and the participant-facing function
does not return ground truth.
