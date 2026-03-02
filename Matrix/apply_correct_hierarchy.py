
import json
import os

def normalize_code(code):
    if not code: return ""
    return code.split('-root')[0].strip()

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

def transform_links(data):
    # 1. Build a map of all links
    link_map = {item['criteria']: set(item.get('linked_criteria', [])) for item in data}
    
    # 2. Break mutual links by prioritizing Standard (Low ID) following Detail (High ID)
    for entry in data:
        cid = entry['criteria']
        links = list(entry.get('linked_criteria', []))
        new_links = []
        for l in links:
            l_clean = normalize_code(l)
            if l_clean in link_map and cid in link_map[l_clean]:
                # Mutual link detected! A <-> B
                # Rule: We want Small ID to follow Large ID (Standard follows Detail)
                if compare_codes(cid, l_clean) < 0:
                    # Current ID is smaller. We are the Standard. 
                    # We KEEP the link to the larger Detail.
                    print(f"Keeping mutual forward link: {cid} -> {l_clean} (Standard follows Detail)")
                    new_links.append(l_clean)
                else:
                    # Current ID is larger. We are the Detail.
                    # We PURGE the link to the smaller Standard (to make Detail editable).
                    print(f"Purging mutual backward link: {cid} -> {l_clean} (Detail should be data entry)")
                    continue
            else:
                new_links.append(l_clean)
        entry['linked_criteria'] = new_links

    # 3. Apply -root tags to remaining backward links
    for entry in data:
        cid = entry['criteria']
        links = entry.get('linked_criteria', [])
        tagged_links = []
        for l in links:
            if compare_codes(l, cid) < 0:
                tagged_links.append(f"{l}-root({l})")
            else:
                tagged_links.append(l)
        entry['linked_criteria'] = tagged_links

    return data

def process_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data = transform_links(data)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
    print(f"Transformed {filepath}")

process_file('src/assets/ems_links.json')
process_file('Matrix/reextracted_ems_links.json')
