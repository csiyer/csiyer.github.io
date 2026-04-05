import os
import shutil
import csv
from datasets import load_dataset
from PIL import Image

# Configuration
BASE_DIR = "stimuli"
AIRPLANE_DIR = os.path.join(BASE_DIR, "airplanes")
UNIQUE_DIR = os.path.join(BASE_DIR, "unique_objects")
HIGHMEM_DIR = os.path.join(BASE_DIR, "highmem")
LOWMEM_DIR = os.path.join(BASE_DIR, "lowmem")

MEMCAT_CSV = os.path.join(BASE_DIR, "memcat_metadata.csv")
MEMCAT_SRC = os.path.join(BASE_DIR, "MemCat_Dataset/MemCat")
MAPPING_CSV = os.path.join(BASE_DIR, "memcat_stimuli_map.csv")

def setup_dirs():
    # Only creating, not clearing yet, will handle in process_memcat
    for d in [AIRPLANE_DIR, UNIQUE_DIR, HIGHMEM_DIR, LOWMEM_DIR]:
        os.makedirs(d, exist_ok=True)

def download_airplanes(limit=300):
    print(f"--- Downloading {limit} Airplanes (Caltech-101) ---")
    count = len([f for f in os.listdir(AIRPLANE_DIR) if f.endswith('.jpg')])
    if count >= limit:
        print(f"Already have {count} airplanes. Skipping.")
        return

    try:
        ds = load_dataset("bitmind/caltech-101", split="train", streaming=True)
        for item in ds:
            if "airplanes/" in item["filename"]:
                img = item["image"].convert("RGB")
                img.save(os.path.join(AIRPLANE_DIR, f"airplane_{count+1}.jpg"))
                count += 1
                if count % 50 == 0: print(f"Saved {count}/{limit} airplanes...")
            if count >= limit: break
    except Exception as e:
        print(f"Error downloading airplanes: {e}")

def download_unique_objects(limit=300):
    print(f"\n--- Downloading {limit} Unique Objects (ImageNet) ---")
    count = len([f for f in os.listdir(UNIQUE_DIR) if f.endswith('.jpg')])
    if count >= limit:
        print(f"Already have {count} unique objects. Skipping.")
        return

    try:
        ds = load_dataset("benjamin-paine/imagenet-1k", split="train", streaming=True)
        unique_labels = set()
        
        for item in ds:
            label = item["label"]
            if label not in unique_labels:
                img = item["image"].convert("RGB")
                img.save(os.path.join(UNIQUE_DIR, f"unique_{count+1}.jpg"))
                unique_labels.add(label)
                count += 1
                if count % 50 == 0: print(f"Saved {count}/{limit} unique objects...")
            
            if count >= limit: break
    except Exception as e:
        print(f"Error downloading unique objects: {e}")

def process_memcat():
    print("\n--- Picking High/Low Memorability Exemplars (Top/Bottom 2 per Category) ---")
    if not os.path.exists(MEMCAT_CSV):
        print(f"Error: {MEMCAT_CSV} not found.")
        return

    # Clear directories to ensure clean index
    for d in [HIGHMEM_DIR, LOWMEM_DIR]:
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))

    # Group by subcategory
    subcats = {}
    with open(MEMCAT_CSV, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cat = row['category']
            subcat = row['subcategory']
            # Score is in columns index 13 usually, but using name
            score = float(row['memorability_w_fa_correction'])
            fname = row['image_file']
            
            if cat.lower() == "sports":
                continue
                
            if subcat not in subcats:
                subcats[subcat] = []
            subcats[subcat].append({'score': score, 'fname': fname, 'cat': cat, 'subcat': subcat})

    mapping_rows = []
    high_count = 0
    low_count = 0
    
    for subcat, items in sorted(subcats.items()):
        # Sort items by score descending
        sorted_items = sorted(items, key=lambda x: x['score'], reverse=True)
        
        # Best 2 (Highest)
        high_exemplars = sorted_items[:2]
        # Worst 2 (Lowest)
        low_exemplars = sorted_items[-2:]
        
        # Process High
        for i, item in enumerate(high_exemplars):
            src_path = os.path.join(MEMCAT_SRC, item['cat'], item['subcat'], item['fname'])
            if os.path.exists(src_path):
                high_count += 1
                exp_fname = f"highmem_{high_count}.jpg"
                shutil.copy(src_path, os.path.join(HIGHMEM_DIR, exp_fname))
                mapping_rows.append({
                    'experiment_filename': exp_fname,
                    'original_filename': item['fname'],
                    'subcategory': item['subcat'],
                    'category': item['cat'],
                    'memorability_score': item['score'],
                    'type': 'highmem'
                })

        # Process Low
        for i, item in enumerate(low_exemplars):
            src_path = os.path.join(MEMCAT_SRC, item['cat'], item['subcat'], item['fname'])
            if os.path.exists(src_path):
                low_count += 1
                exp_fname = f"lowmem_{low_count}.jpg"
                shutil.copy(src_path, os.path.join(LOWMEM_DIR, exp_fname))
                mapping_rows.append({
                    'experiment_filename': exp_fname,
                    'original_filename': item['fname'],
                    'subcategory': item['subcat'],
                    'category': item['cat'],
                    'memorability_score': item['score'],
                    'type': 'lowmem'
                })

    # Write Mapping CSV
    with open(MAPPING_CSV, 'w', newline='') as f:
        fieldnames = ['experiment_filename', 'original_filename', 'subcategory', 'category', 'memorability_score', 'type']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(mapping_rows)
                
    print(f"Processed MemCat: {high_count} highmem and {low_count} lowmem images.")
    print(f"Mapping saved to {MAPPING_CSV}")

if __name__ == "__main__":
    setup_dirs()
    # Assuming airplanes/unique are already there from previous runs if needed
    download_airplanes()
    download_unique_objects()
    process_memcat()
    print("\nDone! All stimuli are in the 'stimuli/' directory.")
