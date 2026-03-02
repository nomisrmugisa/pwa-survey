
import json
import os

def normalize_code(code):
    if not code: return ""
    # Strip prefixes and whitespace
    parts = code.split('_')
    if len(parts) > 1:
        code = parts[-1]
    return code.strip()

def compare_codes(code_a, code_b):
    a = normalize_code(code_a)
    b = normalize_code(code_b)
    if a == b: return 0
    
    parts_a = [int(p) if p.isdigit() else 0 for p in a.split('.')]
    parts_b = [int(p) if p.isdigit() else 0 for p in b.split('.')]
    
    for i in range(max(len(parts_a), len(parts_b))):
        val_a = parts_a[i] if i < len(parts_a) else 0
        val_b = parts_b[i] if i < len(parts_b) else 0
        if val_a < val_b: return -1
        if val_a > val_b: return 1
    return 0

def transform_file(filepath):
    if not os.path.exists(filepath):
        print(f"File {filepath} not found.")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for entry in data:
        criteria = entry.get('criteria')
        links = entry.get('linked_criteria', [])
        new_links = []
        for link in links:
            # If link < criteria, add -root(link)
            if compare_codes(link, criteria) < 0:
                new_links.append(f"{link}-root({link})")
            else:
                new_links.append(link)
        entry['linked_criteria'] = new_links

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
    print(f"Transformed {filepath}")

# Process both files
transform_file('src/assets/ems_links.json')
transform_file('Matrix/reextracted_ems_links.json')
