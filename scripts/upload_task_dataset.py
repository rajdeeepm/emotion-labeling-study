from pathlib import Path
import os
import pandas as pd
from supabase import create_client

DATASET = Path("private/task_dataset.csv")

def main():
    if not DATASET.exists():
        raise SystemExit(
            "private/task_dataset.csv does not exist. Run: python scripts/create_task_dataset.py"
        )

    url = os.environ.get("SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")

    if not url or not secret:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SECRET_KEY in your shell first. "
            "Never put the secret key in config.js or commit it to GitHub."
        )

    df = pd.read_csv(DATASET)
    rows = df.where(pd.notnull(df), None).to_dict(orient="records")

    client = create_client(url, secret)

    version = str(df["study_version"].iloc[0])
    client.table("study_items").delete().eq("study_version", version).execute()

    # Small batches keep the request simple and reliable.
    for start in range(0, len(rows), 25):
        client.table("study_items").insert(rows[start:start+25]).execute()

    print(f"Uploaded {len(rows)} rows for study version {version!r}.")

if __name__ == "__main__":
    main()
