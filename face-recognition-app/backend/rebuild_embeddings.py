import os
import sys
import json
import numpy as np

# Ensure project root is on path so we can import backend.app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app import DATA_DIR, IMAGES_DIR, REGISTRY_PATH, EMBEDDINGS_PATH, image_bytes_to_embedding


def main():
    if not os.path.exists(REGISTRY_PATH):
        print('No registry.json found at', REGISTRY_PATH)
        return
    with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
        registry = json.load(f)
    
    print(f'Found {len(registry)} registered persons')
    embeddings = []
    failed = []
    
    for i, entry in enumerate(registry, 1):
        imgname = entry.get('image')
        student_id = entry.get('student_id', 'unknown')
        name = entry.get('name', 'unknown')
        p = os.path.join(IMAGES_DIR, imgname)
        
        if not os.path.exists(p):
            print(f'[{i}/{len(registry)}] MISSING: {imgname} (ID: {student_id})')
            failed.append(student_id)
            continue
            
        try:
            with open(p, 'rb') as f:
                data = f.read()
            emb = image_bytes_to_embedding(data)
            embeddings.append(emb)
            emb_dim = emb.shape[0] if hasattr(emb, 'shape') else len(emb)
            print(f'[{i}/{len(registry)}] ✓ {name} (ID: {student_id}) - dim={emb_dim}')
        except Exception as e:
            print(f'[{i}/{len(registry)}] FAILED: {imgname} (ID: {student_id}) - {e}')
            failed.append(student_id)

    if len(embeddings) == 0:
        print('\nNo embeddings computed. Check that images exist and are valid.')
        arr = np.empty((0,))
    else:
        arr = np.vstack(embeddings)
        
    os.makedirs(os.path.dirname(EMBEDDINGS_PATH), exist_ok=True)
    np.save(EMBEDDINGS_PATH, arr)
    
    print(f'\n✓ Saved {len(embeddings)} embeddings to {EMBEDDINGS_PATH}')
    print(f'  Shape: {arr.shape}')
    
    if failed:
        print(f'\n⚠ Failed to process {len(failed)} entries: {", ".join(failed)}')


if __name__ == '__main__':
    main()
