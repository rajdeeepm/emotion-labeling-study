from pathlib import Path
import pandas as pd
from datasets import load_dataset

SEED = 202628
STUDY_VERSION = "emotion-v1"
TOTAL_ITEMS = 100
OUTPUT = Path("private/task_dataset.csv")

# These six examples are shown on the instructions page and ARE NOT study items.
PRACTICE_EXAMPLES = {
    "anger": "im feeling really quite angry",
    "fear": "im feeling scared",
    "joy": "i feel very happy and excited since i learned so many things",
    "love": "i feel romantic too",
    "sadness": "i actually feel sorrowful",
    "surprise": "i want to hold this feeling of shocked awe and wonder forever",
}

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    ds = load_dataset("dair-ai/emotion", "split", split="train")
    label_names = ds.features["label"].names

    df = ds.to_pandas().reset_index(names="source_index")
    df["ground_truth"] = df["label"].map(lambda x: label_names[int(x)])
    df["tweet_id"] = df["source_index"].map(lambda x: f"train_{int(x):05d}")

    practice_texts = set(PRACTICE_EXAMPLES.values())
    df = df[~df["text"].isin(practice_texts)].copy()

    # This creates exactly 100 study items, distributed evenly
    # across the six categories: four classes get 17 items and two
    # classes get 16 items.
    emotions = ["anger", "fear", "joy", "love", "sadness", "surprise"]
    base = TOTAL_ITEMS // len(emotions)      # 16
    remainder = TOTAL_ITEMS % len(emotions) # 4

    quotas = {
        emotion: base + (1 if i < remainder else 0)
        for i, emotion in enumerate(emotions)
    }

    sampled_parts = []
    for i, emotion in enumerate(emotions):
        group = df[df["ground_truth"] == emotion]
        sampled_parts.append(
            group.sample(n=quotas[emotion], random_state=SEED + i)
        )

    sampled = (
        pd.concat(sampled_parts, ignore_index=True)
          .sample(frac=1, random_state=SEED)
          .reset_index(drop=True)
    )

    out = pd.DataFrame({
        "study_version": STUDY_VERSION,
        "tweet_id": sampled["tweet_id"],
        "source_split": "train",
        "source_index": sampled["source_index"].astype(int),
        "tweet_text": sampled["text"],
        "ground_truth": sampled["ground_truth"],
    })

    out.to_csv(OUTPUT, index=False)

    print(f"Wrote {len(out)} study items to {OUTPUT}")
    print("\nClass counts:")
    print(out["ground_truth"].value_counts().sort_index())
    print("\nPractice examples present in task pool:", out["tweet_text"].isin(practice_texts).sum())

if __name__ == "__main__":
    main()
