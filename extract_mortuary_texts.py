import os
import re
import sys
import io

# Ensure stdout reflects utf-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from extract_pdf_v2 import extract_to_file

PDF_DIR = "Botswanahq_motuary"
TEXT_SUBDIR = "extracted_text"


def find_pdf_files(pdf_dir: str):
    """Return list of (se_id:int, pdf_path:str) for Mortuary standard PDFs."""
    pdfs = []
    for name in os.listdir(pdf_dir):
        if not name.lower().endswith(".pdf"):
            continue
        # Expect pattern like: "Botswana MORTUARY Standards SE 1 Management of Mortuary Services.pdf"
        m = re.search(r"SE\s+(\d+)", name, re.IGNORECASE)
        if not m:
            continue
        se_id = int(m.group(1))
        pdfs.append((se_id, os.path.join(pdf_dir, name)))
    pdfs.sort(key=lambda x: x[0])
    return pdfs


def extract_all_pdfs_to_text(pdf_files, pdf_dir: str):
    """Use extract_pdf_v2 to dump each PDF to a text file under a subdirectory.

    Returns list of text file paths in SE order.
    """
    text_dir = os.path.join(pdf_dir, TEXT_SUBDIR)
    os.makedirs(text_dir, exist_ok=True)

    text_paths = []
    for se_id, pdf_path in pdf_files:
        out_txt = os.path.join(text_dir, f"se_{se_id}.txt")
        print(f"[MORTUARY PDF] Extracting SE {se_id} from '{pdf_path}' -> '{out_txt}'")
        # Use a high end_page; extract_to_file will clamp to the real page count.
        extract_to_file(pdf_path, start_page=1, end_page=999, output_path=out_txt)
        text_paths.append(out_txt)

    return text_paths


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

    # Extract each PDF to a text file
    text_paths = extract_all_pdfs_to_text(pdf_files, PDF_DIR)

    print(f"\nDone. Extracted {len(text_paths)} text file(s) to '{PDF_DIR}/{TEXT_SUBDIR}/'.")


if __name__ == "__main__":
    main()
