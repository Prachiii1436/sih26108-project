# Data Directory

This directory contains sample/curated datasets for the SIH26108 prototype.

## Purpose

The system ships with demonstration data so it runs end-to-end immediately (without requiring access to full copyrighted BIS corpora). All records in the seed set are **DEMONSTRATION DATA** - they are placeholder metadata created by the project team to illustrate the recommendation flow.

## Files

- `sample_standards.csv` - Tabular metadata used by `scripts/import_standards.py` and loaded into `indian_standards`. Columns match the schema in `database/sih26108.sql`.
- `README.md` - This document.

## Data Source & Copyright Notice

**IMPORTANT - BIS Data / Copyright**

Do not scrape or redistribute copyrighted Bureau of Indian Standards (BIS) documents, standards texts, or complete official catalogues without explicit written permission from BIS.

This prototype is designed to work with:

- Permitted metadata (IS numbers, titles, sector/category, scope/description, keywords, high-level requirements) that may be lawfully curated
- Publicly available reference information
- Data supplied/provided by the project team for academic/hackathon demonstration
- Verified institutional datasets obtained with appropriate rights

## Usage Guidelines

1. Every record includes `source="DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record"`.
2. The UI shows a disclaimer on all recommendations: *"Prototype recommendation only. The confidence score reflects semantic similarity against a small curated knowledge base, not a legal opinion. Verify the applicable standard, edition and amendments on https://www.bis.gov.in before finalising any procurement."*
3. **Replace before real-world deployment.** Substitute with verified/licensed Indian Standards data. If no match exists in the current knowledge base, the system explicitly states that - it does **not** claim a standard does not exist.
4. Source URL, year, status, revision are retained for traceability.

## Importing

```bash
cd backend
venv\Scripts\activate  (Windows)
python ../scripts/import_standards.py --csv ../data/sample_standards.csv
```

The import script:
1. Reads CSV/JSON/Excel
2. Validates records (required fields, types)
3. Inserts/updates MySQL `indian_standards`
4. Generates sentence-transformer embeddings
5. Rebuilds the FAISS/vector index used for semantic search

## Contributing Data

If contributing additional metadata, ensure you have rights to share it and mark it appropriately. Never commit copyrighted full-text standards.
