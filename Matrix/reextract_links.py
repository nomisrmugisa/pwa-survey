import re
import json
import os

def load_valid_ids(config_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    valid_ids = set()
    for se in config.get('ems_full_configuration', []):
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
    
    id_pattern = r'\d+\.\d+\.\d+\.\d+'
    
    def is_header(line):
        return ("Criteria" in line and "Description" in line)

    for line in lines:
        raw_line = line
        line = line.replace('\n', ' ').strip()
        if not line:
            if current_item and not current_item["description"]:
                # If we have a main ID but no description yet and hit an empty line,
                # it might be a weird break. Continue.
                continue
            continue
        
        if line.startswith('--- Page') or is_header(line) or re.match(r'^Page \d+ of \d+', line):
            continue

        # Check for ID at start of line
        main_match = re.match(rf'^({id_pattern})\b\s*(.*)$', line)
        
        if main_match:
            detected_id = main_match.group(1)
            remaining = main_match.group(2).strip()
            
            # HEURISTIC: A main criterion starts with a valid ID 
            # AND is followed by at least 15 characters of non-ID text (the description)
            # OR it's a known valid ID and we don't have a current item.
            # (15 chars is a safe bet for a description start)
            
            # Check if remaining starts with another ID (which would mean the current line is just links)
            starts_with_another_id = re.match(rf'^{id_pattern}', remaining)
            
            if detected_id in valid_ids and len(remaining) > 10 and not starts_with_another_id:
                if current_item:
                    results.append(current_item)
                
                # Extract links at the end of the line
                links_at_end = []
                while True:
                    m = re.search(rf'\s+({id_pattern})\s*$', remaining)
                    if m:
                        if m.group(1) in valid_ids:
                            links_at_end.append(m.group(1))
                        remaining = remaining[:m.start()].strip()
                    else:
                        break
                
                current_item = {
                    "criteria": detected_id,
                    "description": remaining,
                    "linked_criteria": list(reversed(links_at_end))
                }
                continue

        # Continuation or Link line
        if current_item:
            # Check for IDs in the line
            links = re.findall(id_pattern, line)
            
            # If the line is ONLY IDs, they are links
            if re.match(rf'^({id_pattern})(\s+{id_pattern})*\s*$', line):
                current_item["linked_criteria"].extend([l for l in links if l in valid_ids])
            else:
                # Text with potential links at the end
                links_at_end = []
                while True:
                    m = re.search(rf'\s+({id_pattern})\s*$', line)
                    if m:
                        if m.group(1) in valid_ids:
                            links_at_end.append(m.group(1))
                        line = line[:m.start()].strip()
                    else:
                        break
                
                if line:
                    # Avoid appending "Page X of Y" or headers if they leaked through
                    if not ("Page" in line and "of" in line):
                        if current_item["description"]:
                            current_item["description"] += " " + line
                        else:
                            current_item["description"] = line
                
                current_item["linked_criteria"].extend(reversed(links_at_end))

    if current_item:
        results.append(current_item)

    # Dedup and Clean
    seen_criteria = set()
    cleaned_results = []
    for item in results:
        # Avoid duplicates (if a criterion appears twice as main, usually first is better)
        if item["criteria"] in seen_criteria:
            continue
        seen_criteria.add(item["criteria"])
        
        item["linked_criteria"] = sorted(list(set(item["linked_criteria"])))
        item["description"] = re.sub(r'\s+', ' ', item["description"]).strip()
        # Remove trailing punctuation often found in Col 3 transitions
        item["description"] = item["description"].rstrip(' .;,')
        
        if item["description"]:
            cleaned_results.append(item)

    return cleaned_results

if __name__ == "__main__":
    valid_ids = load_valid_ids("src/assets/ems_config.json")
    links = parse_links("Matrix/extracted_text.txt", valid_ids)
    
    with open("src/assets/ems_links.json", 'w', encoding='utf-8') as f:
        json.dump(links, f, indent=4)
        
    print(f"Extraction complete. Found {len(links)} criteria with links.")
