import os
import re
import json
import subprocess
import sys

# Add current dir to path to import local modules
sys.path.append(os.getcwd())

import parse_mortuary_text

PDF_DIR = "Botswanahq_motuary"
TEXT_SUBDIR = "extracted_text"
OUTPUT_JSON_MAIN = os.path.join("src", "assets", "mortuary_config.json")

def find_pdf_files(pdf_dir: str):
    pdfs = []
    if not os.path.isdir(pdf_dir):
        return []
    for name in os.listdir(pdf_dir):
        if not name.lower().endswith(".pdf"):
            continue
        m = re.search(r"SE\s+(\d+)", name, re.IGNORECASE)
        if not m:
            continue
        se_id = int(m.group(1))
        pdfs.append((se_id, os.path.join(pdf_dir, name)))
    pdfs.sort(key=lambda x: x[0])
    return pdfs

def build_se_name_map(pdf_files):
    se_name_map = {}
    for se_id, path in pdf_files:
        filename = os.path.basename(path)
        m = re.search(r"SE\s+%d\s+(.+?)\.pdf$" % se_id, filename, re.IGNORECASE)
        if m:
            se_name = m.group(1).strip()
            se_name_map[se_id] = se_name
    return se_name_map

def main():
    if not os.path.isdir(PDF_DIR):
        print(f"ERROR: PDF directory '{PDF_DIR}' not found.")
        return

    pdf_files = find_pdf_files(PDF_DIR)
    if not pdf_files:
        print(f"ERROR: No Mortuary standard PDFs found under '{PDF_DIR}'.")
        return

    print("Found Mortuary PDFs:")
    for se_id, path in pdf_files:
        print(f"  SE {se_id}: {os.path.basename(path)}")

    # 1) Get text paths (already extracted in previous step)
    text_dir = os.path.join(PDF_DIR, TEXT_SUBDIR)
    text_paths = []
    for se_id, _ in pdf_files:
        txt_path = os.path.join(text_dir, f"se_{se_id}.txt")
        if os.path.exists(txt_path):
            text_paths.append(txt_path)
        else:
            print(f"WARNING: Text file {txt_path} not found. Did you run extraction?")

    # 2) Parse text files
    print("\nParsing extracted text into Mortuary configuration ...")
    config = parse_mortuary_text.parse_text(text_paths)

    # 3) Override se_name using the official names from the PDF filenames
    se_name_map = build_se_name_map(pdf_files)
    for se in config.get("mortuary_full_configuration", []):
        se_id = se.get("se_id")
        if se_id in se_name_map:
            se["se_name"] = se_name_map[se_id]

    # 4) Write out JSON file
    os.makedirs(os.path.dirname(OUTPUT_JSON_MAIN), exist_ok=True)
    with open(OUTPUT_JSON_MAIN, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    # Also write a UTF-8 specific one for safety if needed (following EMS pattern)
    with open("mortuary_config_utf8.json", "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Mortuary configuration has been generated to {OUTPUT_JSON_MAIN}")

if __name__ == "__main__":
    main()
