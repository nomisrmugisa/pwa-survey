
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

def parse_pdf_columns(text_path, valid_ids):
    with open(text_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    id_pattern = r'\d+\.\d+\.\d+\.\d+'
    
    # Set of (Target, Source) pairs
    # Target = Col 1, Source = Col 3
    relationships = set()
    
    current_target = None
    
    for line in lines:
        raw_line = line
        line = line.strip()
        if not line or "--- Page" in line or "Criteria" in line:
            continue
            
        id_match = re.search(id_pattern, line)
        if not id_match:
            continue

        # Check if line STARTS with an ID
        starts_with_id = re.match(rf'^({id_pattern})\b', line)
        
        if starts_with_id:
            detected_id = starts_with_id.group(1)
            remaining = line[len(detected_id):].strip()
            
            # If it's a valid ID and has significant text following it, it's a TARGET
            if detected_id in valid_ids and len(remaining) > 10 and not re.match(id_pattern, remaining):
                current_target = detected_id
                print(f"New Target: {current_target}")
                # Any other IDs on THIS line are also links
                other_ids = re.findall(id_pattern, remaining)
                for oid in other_ids:
                    if oid in valid_ids and oid != current_target:
                        relationships.add((current_target, oid))
                continue

        # If it's NOT a target line but contains IDs, they are links for the active target
        if current_target:
            ids_in_line = re.findall(id_pattern, line)
            for found_id in ids_in_line:
                if found_id in valid_ids and found_id != current_target:
                    relationships.add((current_target, found_id))

    return relationships

def build_json(relationships, valid_ids):
    # final_map: { id: { "criteria": id, "linked_criteria": set() } }
    final_data = {}
    
    for target, source in relationships:
        if target not in final_data:
            final_data[target] = {"criteria": target, "linked_criteria": set()}
        if source not in final_data:
            final_data[source] = {"criteria": source, "linked_criteria": set()}
            
        # 1. Target PULLS from Source (Calculation Link)
        final_data[target]["linked_criteria"].add(source)
        
        # 2. Source is TOLD about its Root (Audit/Push Link)
        final_data[source]["linked_criteria"].add(f"{target}-root({target})")
        
    # Convert sets to sorted lists
    results = []
    for cid in sorted(final_data.keys()):
        item = final_data[cid]
        item["linked_criteria"] = sorted(list(item["linked_criteria"]))
        results.append(item)
        
    return results

if __name__ == "__main__":
    valid_ids = load_valid_ids("src/assets/ems_config.json")
    rels = parse_pdf_columns("Matrix/extracted_text.txt", valid_ids)
    print(f"Extracted {len(rels)} directional relationships.")
    
    links_json = build_json(rels, valid_ids)
    
    with open("src/assets/ems_links.json", 'w', encoding='utf-8') as f:
        json.dump(links_json, f, indent=4)
        
    print(f"Rebuilt ems_links.json with column-based hierarchy. Total entries: {len(links_json)}")
