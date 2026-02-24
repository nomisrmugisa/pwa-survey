import os
import re
import json

from extract_pdf_v2 import extract_to_file
import parse_ems_text


PDF_DIR = "Botswananhq_ems"
TEXT_SUBDIR = "extracted_text"
OUTPUT_JSON_MAIN = os.path.join("src", "assets", "ems_config.json")
OUTPUT_JSON_UTF8 = "ems_config_utf8.json"


def find_pdf_files(pdf_dir: str):
    """Return list of (se_id:int, pdf_path:str) for EMS standard PDFs."""
    pdfs = []
    for name in os.listdir(pdf_dir):
        if not name.lower().endswith(".pdf"):
            continue
        # Expect pattern like: "Botswana EMS Standards SE 1 Management and Leadership.pdf"
        m = re.search(r"SE\s+(\d+)", name, re.IGNORECASE)
        if not m:
            continue
        se_id = int(m.group(1))
        pdfs.append((se_id, os.path.join(pdf_dir, name)))
    pdfs.sort(key=lambda x: x[0])
    return pdfs


def build_se_name_map(pdf_files):
    """Map se_id -> se_name taken from the PDF filenames."""
    se_name_map = {}
    for se_id, path in pdf_files:
        filename = os.path.basename(path)
        # Capture the part after "SE <id> " up to ".pdf"
        m = re.search(r"SE\s+%d\s+(.+?)\.pdf$" % se_id, filename, re.IGNORECASE)
        if m:
            se_name = m.group(1).strip()
            se_name_map[se_id] = se_name
    return se_name_map


def extract_all_pdfs_to_text(pdf_files, pdf_dir: str):
    """Use extract_pdf_v2 to dump each PDF to a text file under a subdirectory.

    Returns list of text file paths in SE order.
    """
    text_dir = os.path.join(pdf_dir, TEXT_SUBDIR)
    os.makedirs(text_dir, exist_ok=True)

    text_paths = []
    for se_id, pdf_path in pdf_files:
        out_txt = os.path.join(text_dir, f"se_{se_id}.txt")
        print(f"[EMS PDF] Extracting SE {se_id} from '{pdf_path}' -> '{out_txt}'")
        # Use a high end_page; extract_to_file will clamp to the real page count.
        extract_to_file(pdf_path, start_page=1, end_page=999, output_path=out_txt)
        text_paths.append(out_txt)

    return text_paths


def write_config(config: dict):
    """Write config JSON to both main and UTF8 files."""
    for path in (OUTPUT_JSON_MAIN, OUTPUT_JSON_UTF8):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"[EMS JSON] Wrote {path}")


def main():
    if not os.path.isdir(PDF_DIR):
        print(f"ERROR: PDF directory '{PDF_DIR}' not found.")
        return

    pdf_files = find_pdf_files(PDF_DIR)
    if not pdf_files:
        print(f"ERROR: No EMS standard PDFs found under '{PDF_DIR}'.")
        return

    print("Found EMS PDFs:")
    for se_id, path in pdf_files:
        print(f"  SE {se_id}: {os.path.basename(path)}")

    # 1) Extract each PDF to a text file
    text_paths = extract_all_pdfs_to_text(pdf_files, PDF_DIR)

    # 2) Parse text files into EMS configuration structure
    print("\nParsing extracted text into EMS configuration ...")
    config = parse_ems_text.parse_text(text_paths)

    # 3) Override se_name using the official names from the PDF filenames
    se_name_map = build_se_name_map(pdf_files)
    for se in config.get("ems_full_configuration", []):
        se_id = se.get("se_id")
        if se_id in se_name_map:
            se["se_name"] = se_name_map[se_id]

    # 4) Write out JSON files used by the app
    write_config(config)
    print("\nDone. EMS configuration has been regenerated from PDFs.")


if __name__ == "__main__":
    main()

