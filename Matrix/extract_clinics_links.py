import re
import json
import os

def load_valid_ids(config_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    valid_ids = set()
    # Clinics config uses 'clinics_full_configuration'
    for se in config.get('clinics_full_configuration', []):
        for section in se.get('sections', []):
            for standard in section.get('standards', []):
                for crit in standard.get('criteria', []):
                    valid_ids.add(crit['id'])
    return valid_ids

def parse_links(text_path, valid_ids):
    with open(text_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    results = []
    current_item = None
    
    # ID pattern: allow for some OCR errors like double dots or missing dots
    id_pattern = r'\b\d+[\.\s]+\d+[\.\s]+\d+[\.\s]+\d+\b'
    
    def normalize_id(raw_id):
        clean = re.sub(r'[\s\.]+', '.', raw_id).strip('.')
        parts = clean.split('.')
        if len(parts) == 4:
            return ".".join(parts)
        # Handle cases like 1.1.13 -> 1.1.1.3 (heuristic)
        if len(parts) == 3 and len(parts[2]) == 2:
            return f"{parts[0]}.{parts[1]}.{parts[2][0]}.{parts[2][1]}"
        return clean

    def is_header(line):
        return ("Criteria" in line and "Description" in line)

    for line in lines:
        line = line.replace('\n', ' ').strip()
        if not line:
            continue
        
        if line.startswith('--- Page') or is_header(line) or re.match(r'^Page \d+ of \d+', line):
            continue

        # Look for IDs in the line
        found_ids = []
        for match in re.finditer(id_pattern, line):
            norm = normalize_id(match.group())
            if norm in valid_ids:
                found_ids.append((norm, match.start(), match.end()))

        # A main criterion usually starts with an ID at the very beginning
        if found_ids and found_ids[0][1] < 10: # Increased threshold slightly
            main_id, start, end = found_ids[0]
            remaining = line[end:].strip()
            
            # Check if line is ONLY IDs
            only_ids = re.match(rf'^(\s*{id_pattern}\s*)+$', line)
            
            if not only_ids:
                if current_item:
                    results.append(current_item)
                
                # Extract links that might be on the same line
                links = [id_info[0] for id_info in found_ids[1:]]
                
                description = remaining
                for link_id, l_start, l_end in found_ids[1:]:
                    description = description.replace(link_id, "").strip()

                current_item = {
                    "criteria": main_id,
                    "description": description,
                    "linked_criteria": links,
                    "root": [] # Initialize root for bidirectional logic later
                }
                continue

        # If no main ID found at start, or it was just a link line
        if current_item:
            # Add all found IDs as links
            for norm, start, end in found_ids:
                if norm != current_item["criteria"]:
                    if norm not in current_item["linked_criteria"]:
                        current_item["linked_criteria"].append(norm)
            
            # Add text to description if it's not just IDs and not a SE header
            text_only = line
            for raw_val in re.findall(id_pattern, line):
                text_only = text_only.replace(raw_val, "")
            text_only = text_only.strip()
            
            if text_only and not re.match(r'^SE \d+', text_only):
                if current_item["description"]:
                    current_item["description"] += " " + text_only
                else:
                    current_item["description"] = text_only

    if current_item:
        results.append(current_item)

    # Dedup and Clean
    seen_criteria = set()
    cleaned_results = []
    
    # First pass: clean descriptions and collect basic links
    for item in results:
        if item["criteria"] in seen_criteria:
            continue
        seen_criteria.add(item["criteria"])
        
        item["linked_criteria"] = sorted(list(set(item["linked_criteria"])))
        item["description"] = re.sub(r'\s+', ' ', item["description"]).strip()
        item["description"] = item["description"].rstrip(' .;,')
        
        cleaned_results.append(item)

    # Second pass: compute "root" (reverse links)
    criteria_map = {item["criteria"]: item for item in cleaned_results}
    
    # Ensure all valid IDs are in the results even if they don't have links in matrix
    for vid in valid_ids:
        if vid not in criteria_map:
            new_item = {"criteria": vid, "description": "", "linked_criteria": [], "root": []}
            cleaned_results.append(new_item)
            criteria_map[vid] = new_item

    for item in cleaned_results:
        for linked in item["linked_criteria"]:
            if linked in criteria_map:
                if item["criteria"] not in criteria_map[linked]["root"]:
                    criteria_map[linked]["root"].append(item["criteria"])

    # Final cleanup: sort everything
    for item in cleaned_results:
        item["linked_criteria"].sort()
        item["root"].sort()

    return cleaned_results

if __name__ == "__main__":
    valid_ids = load_valid_ids("src/assets/clinics_config.json")
    links = parse_links("Matrix/clinics_matrix_text.txt", valid_ids)
    
    with open("src/assets/clinics_links.json", 'w', encoding='utf-8') as f:
        json.dump(links, f, indent=4)
        
    print(f"Extraction complete. Found {len(links)} criteria items for Clinics.")
