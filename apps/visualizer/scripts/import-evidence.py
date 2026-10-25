"""Build the reviewed proof-of-concept bundle from preserved source snapshots.

Usage: python import-evidence.py SOURCE_DIRECTORY
Requires xlrd==2.0.2 for the original publisher's .xls supplement. All other
parsing is standard-library code. No API keys or spreadsheet credentials used.
"""
import csv
import hashlib
import json
import statistics
import sys
from pathlib import Path

import xlrd

SOURCE = Path(sys.argv[1])
APP = Path(__file__).resolve().parents[1]
COMMIT = '4829b83ace51ee7980de6950077f1cf8f3746f88'
SHEET = 'https://docs.google.com/spreadsheets/d/10ettJUyxtRmGjoIsSQfX7aDFRgyhYHonRwjAGOl5NQI/edit'
RAW = f'https://raw.githubusercontent.com/SBRG/precise1k/{COMMIT}/data/'
SUPPLEMENT = 'https://media.springernature.com/original/springer-static/esm/art%3A10.1186%2F1471-2164-10-53/MediaObjects/12864_2008_1937_MOESM6_ESM.zip'


def records(name):
    with (SOURCE / name).open() as handle:
        return list(csv.DictReader(handle))


def source_record(name, url):
    data = (SOURCE / name).read_bytes()
    return {'file': name, 'url': url, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def observation(gene, locus, label, reference, condition, probe=None, reported_sd=None):
    assert reference or condition
    assert all(isinstance(x, (int, float)) for x in reference + condition)
    value = statistics.mean(condition) - statistics.mean(reference) if reference else statistics.mean(condition)
    return {'id': gene, 'locus': locus, 'label': label, 'referenceValues': reference,
            'conditionValues': condition, 'value': value, 'probe': probe, 'reportedSd': reported_sd,
            'padj': None, 'valueKind': 'derived'}


workbook = json.loads((SOURCE / 'workbook.json').read_text())
catalog = []
for sheet in workbook:
    if sheet['name'] not in ['01_Train_Chassix', '02_test_novel']:
        continue
    train = sheet['name'] == '01_Train_Chassix'
    for cells in sheet['rows'][1:]:
        row = int(''.join(filter(str.isdigit, next(iter(cells)))))
        get = lambda col: cells.get(f'{col}{row}', '')
        catalog.append({
            'id': f'{"train" if train else "test"}-{row}', 'organism': get('A'),
            'domain': get('B'), 'strain': get('C') or 'Not pinned in workbook',
            'partition': 'Training target' if train else 'Held-out target',
            'dataDepth': get('E' if train else 'F'), 'rationale': get('D'),
            'resources': [get(c) for c in (['M', 'N', 'O'] if train else ['K']) if get(c)],
            'model': get('J' if train else 'G'), 'modelStatus': get('K' if train else 'H') or 'Not asserted',
            'assembly': get('F') if train else '', 'assemblyStatus': get('G') if train else '',
            'proteome': get('H') if train else '', 'proteomeStatus': get('I') if train else '',
            'leakage': '' if train else get('I'), 'note': get('P' if train else 'L'),
            'sourceSheet': sheet['name'], 'sourceRow': row,
            'sourceUrl': SHEET, 'ingestionStatus': 'Catalog only; no training run',
        })

# One study, strain, medium, pH, and sequencing compendium. No cross-study control.
metadata = {row['']: row for row in records('ecoli-metadata.csv')}
reference_ids = ['p1k_00011', 'p1k_00012']
condition_ids = ['p1k_00017', 'p1k_00018']
for sample_id in reference_ids + condition_ids:
    sample = metadata[sample_id]
    assert sample['project'] == 'acid' and sample['GEO'] == 'GSE66482'
    assert sample['Temperature (C)'] == '37' and sample['pH'] == '5.5'
    assert sample['Base Media'] == 'M9' and sample['Carbon Source (g/L)'] == 'glucose(2)'
assert all(metadata[x]['condition'] == 'wt_ph5' for x in reference_ids)
assert all(metadata[x]['condition'] == 'delgade_ph5' for x in condition_ids)
gene_info = {row['locus_tag']: row for row in records('ecoli-genes.csv')}
ecoli_genes = ['gadE', 'gadX', 'gadW', 'gadA', 'gadB', 'gadC', 'hdeA', 'hdeB', 'rpoS']
ecoli_observations = []
for row in records('ecoli-log-tpm.csv'):
    annotation = gene_info.get(row[''], {})
    symbol = annotation.get('gene_name')
    if symbol in ecoli_genes:
        ecoli_observations.append(observation(symbol, row[''], annotation['gene_product'],
                                             [float(row[x]) for x in reference_ids],
                                             [float(row[x]) for x in condition_ids]))
assert len(ecoli_observations) == len(ecoli_genes)
ecoli_observations.sort(key=lambda row: ecoli_genes.index(row['id']))
ecoli_edges = []
for row in records('ecoli-trn.csv'):
    regulator = next((g for g in ecoli_genes if g.lower() == row['regulator'].lower()), None)
    if regulator and row['gene_name'] in ecoli_genes and regulator != row['gene_name'] and row['effect'] in ['+', '-']:
        edge = {'from': regulator, 'to': row['gene_name'], 'effect': row['effect'],
                'source': 'PRECISE-1K TRN.csv / ' + row['source'],
                'url': RAW + 'annotation/TRN.csv'}
        if edge not in ecoli_edges:
            ecoli_edges.append(edge)

samples = [{**{k: metadata[x][k] for k in ['sample_id', 'Strain Description', 'Temperature (C)', 'pH', 'Base Media', 'Carbon Source (g/L)', 'GEO', 'Run']},
            'id': x, 'group': 'Reference' if x in reference_ids else 'Condition'} for x in reference_ids + condition_ids]
studies = [{
    'id': 'ecoli-gade', 'chassisId': 'bacterium', 'title': 'A gene deletion under acid stress',
    'shortTitle': 'E. coli · acid response', 'organism': 'Escherichia coli', 'strain': 'K-12 MG1655 / ΔgadE derivative',
    'reference': 'Wild type', 'condition': 'ΔgadE', 'context': '37°C · pH 5.5 · M9 + 2 g/L glucose',
    'accession': 'GSE66482 / PRECISE-1K', 'assay': 'RNA-seq', 'unit': 'Δ log₂TPM', 'nativeUnit': 'log₂TPM',
    'method': 'Mean of two ΔgadE log₂TPM values minus mean of two wild-type log₂TPM values from the authors’ quality-controlled matrix. No p-values or significance calls were calculated.',
    'sampleNote': '2 wild-type + 2 ΔgadE biological replicates; same study and recorded culture conditions.',
    'limitation': 'A descriptive re-analysis of a published perturbation. Transcript abundance is not regulator activity, protein abundance, viability, or product yield.',
    'story': 'Inspect gadA, gadB, and hdeA after gadE deletion, then trace each expression change to the four original RNA-seq samples.',
    'citation': 'Nature Communications, 2015. Decoding genome-wide GadEWX transcriptional regulatory networks reveals a multifaceted cellular response to acid stress in Escherichia coli. PMID: 26258987.',
    'sourceTitle': 'Seo et al. · Nature Communications · 2015', 'sourceUrl': 'https://doi.org/10.1038/ncomms8970',
    'dataUrl': f'https://github.com/SBRG/precise1k/tree/{COMMIT}/data/precise1k',
    'sourceLocator': 'log_tpm_qc.csv + metadata_qc.csv; pinned author repository commit ' + COMMIT,
    'license': 'PRECISE-1K repository: MIT; original study cited separately.',
    'observations': ecoli_observations, 'samples': samples, 'edges': ecoli_edges,
    'edgeNote': 'Directed links are curated reference annotations from the author TRN, independent of this expression contrast. Co-expression is not used to infer new edges.',
}]

# Preserve probe-level values and match every non-temperature culture field.
book = xlrd.open_workbook(SOURCE / 'yeast-supplement/AD1.xls')
description = book.sheet_by_name('Array descriptions')
arrays = {int(description.cell_value(i, 0)): description.row_values(i) for i in range(1, description.nrows)}
ref_arrays, cond_arrays = [156, 157, 158], [153, 154, 155]
clean = lambda value: str(value).strip("'")
for i in ref_arrays + cond_arrays:
    row = arrays[i]
    assert clean(row[1]) == 'CEN.PK 113-7D' and clean(row[8]) == 'Carbon'
    assert clean(row[9]) == '.03' and clean(row[11]) == '5'
    assert clean(row[2]) == 'Anaerobic' and clean(row[13]) == 'A'
    assert clean(row[10]) == ('30' if i in ref_arrays else '12')
assert all([clean(x) for x in arrays[i][1:10] + arrays[i][11:14]] == [clean(x) for x in arrays[156][1:10] + arrays[156][11:14]] for i in ref_arrays + cond_arrays)
expression = book.sheet_by_name('Expression data')
columns = {int(expression.cell_value(0, i)): i for i in range(4, expression.ncols)}
yeast_genes = ['HSF1', 'MSN2', 'MSN4', 'HSP104', 'HSP82', 'SSA1', 'TPS1', 'CTT1', 'SKN7']
yeast_observations = []
for i in range(1, expression.nrows):
    row = expression.row_values(i)
    if clean(row[2]) in yeast_genes:
        yeast_observations.append(observation(clean(row[2]), clean(row[1]), clean(row[2]),
                                             [row[columns[x]] for x in ref_arrays], [row[columns[x]] for x in cond_arrays], clean(row[0])))
assert len(yeast_observations) == len(yeast_genes)
yeast_observations.sort(key=lambda row: yeast_genes.index(row['id']))
studies.append({
    'id': 'yeast-cold', 'chassisId': 'yeast', 'title': 'Cold adaptation in a controlled culture',
    'shortTitle': 'Yeast · 12°C vs 30°C', 'organism': 'Saccharomyces cerevisiae', 'strain': 'CEN.PK113-7D',
    'reference': '30°C chemostat', 'condition': '12°C chemostat',
    'context': 'pH 5 · anaerobic · glucose / carbon limitation · dilution 0.03 h⁻¹',
    'accession': 'GSE11452 / GSE6190', 'assay': 'Affymetrix microarray', 'unit': 'Δ RMA log expression', 'nativeUnit': 'RMA log expression',
    'method': 'Mean of three 12°C RMA log-scale probe values minus mean of three 30°C values. Source supplement array IDs 153–155 vs 156–158; no further normalization or significance tests.',
    'sampleNote': '3 biological replicates per temperature, matched for the other recorded cultivation fields and preparation protocol.',
    'limitation': 'Steady-state cold adaptation, not an acute heat shock. Probe-level measurements are retained. This dataset does not represent S288C or calibrated protein activity.',
    'story': 'Compare the measured cold-adaptation profile with the bacterial perturbation. Study context and native assay units stay attached to every gene.',
    'citation': 'BMC Genomics, 2009. Combinatorial effects of environmental parameters on transcriptional regulation in Saccharomyces cerevisiae: A quantitative analysis of a compendium of chemostat-based transcriptome data. PMID: 19173729.',
    'sourceTitle': 'Knijnenburg et al. · BMC Genomics · 2009', 'sourceUrl': 'https://doi.org/10.1186/1471-2164-10-53',
    'dataUrl': SUPPLEMENT, 'sourceLocator': 'Additional file 6 / AD1.xls / Expression data and Array descriptions',
    'license': 'Original article and supplement: CC BY 2.0.',
    'observations': yeast_observations,
    'samples': [{'id': f'Array {i}', 'sample_id': arrays[i][20], 'group': 'Reference' if i in ref_arrays else 'Condition',
                 'temperature': clean(arrays[i][10]), 'strain': clean(arrays[i][1])} for i in ref_arrays + cond_arrays],
    'edges': [], 'edgeNote': 'Genes were co-measured. No regulatory edges are inferred from this six-sample contrast.',
})

table = json.loads((SOURCE / 'archaea-tables.json').read_text())
archaea_genes = ['PF1883', 'PF1882', 'PF0963', 'PF1974', 'PF0380']
archaea_observations = []
for row in table:
    if len(row) == 6 and row[1] in archaea_genes:
        values = [float(row[i].split('±')[0].strip().replace('−', '-')) for i in [2, 4]]
        sd = [float(row[i].split('±')[1].strip()) for i in [2, 4]]
        archaea_observations.append(observation(row[1], row[1], row[0], [], values, reported_sd=sd))
assert len(archaea_observations) == 5
studies.append({
    'id': 'archaea-heat', 'chassisId': 'archaeon', 'title': 'Heat shock at the edge of life',
    'shortTitle': 'P. furiosus · 90°C → 105°C', 'organism': 'Pyrococcus furiosus', 'strain': 'DSM 3638',
    'reference': '90°C control', 'condition': '105°C for 1 hour', 'context': 'Sea-salts medium · tryptone + yeast extract · mid-exponential shift',
    'accession': 'PMID 12676722 · Table 1', 'assay': 'Targeted cDNA microarray', 'unit': 'log₂ ratio', 'nativeUnit': 'log₂ ratio',
    'method': 'Arithmetic mean of the two reported log₂ intensity ratios in Table 1. Each source value and its reported SD is preserved. No baseline abundance, pooled uncertainty, or p-value is invented.',
    'sampleNote': 'Two reported replicate columns; technical spot replication and independent RNA isolation are described in the paper.',
    'limitation': 'Five selected chaperone-related loci from a targeted array. These measurements apply to P. furiosus DSM 3638, not Sulfolobus or Halobacterium. No direct regulatory links are established here.',
    'story': 'Inspect measured chaperone responses after a 90°C to 105°C shift. The thermosome locus PF1974 has reported log₂ ratios of 2.00 and 2.07.',
    'citation': 'Applied and Environmental Microbiology, 2003. Heat Shock Response by the Hyperthermophilic Archaeon Pyrococcus furiosus. PMID: 12676722.',
    'sourceTitle': 'Shockley et al. · Applied and Environmental Microbiology · 2003',
    'sourceUrl': 'https://doi.org/10.1128/AEM.69.4.2365-2371.2003',
    'dataUrl': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC154833/#T1', 'sourceLocator': 'Table 1 / chaperone-related genes',
    'license': 'Numerical observations transcribed with attribution; publisher copyright applies to the article.',
    'observations': archaea_observations, 'samples': [], 'edges': [],
    'edgeNote': 'Co-measured loci only. No causal or direct regulatory edges are inferred.',
})

audit = [
    {'id': 'strain-gse11452', 'status': 'Corrected', 'title': 'GSE11452 is CEN.PK113-7D',
     'detail': 'GEO design and publisher sample metadata identify CEN.PK113-7D. The S288C catalog row is not used to assign this measurement.',
     'url': 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE11452'},
    {'id': 'strain-pxd016519', 'status': 'Catalog only', 'title': 'PXD016519 culture and search reference differ',
     'detail': 'PRIDE identifies CEN.PK113-7D BAR1::KanMX cultures and an S288C search proteome. The 204 omic samples are 51 biological samples × four layers. No protein or metabolite measurements from this accession have been loaded.',
     'url': 'https://www.ebi.ac.uk/pride/archive/projects/PXD016519'},
    {'id': 'wrong-gse1456', 'status': 'Rejected', 'title': 'GSE1456 is a human tumor series',
     'detail': 'The GEO record describes human breast cancer tissue. It is excluded from microbial measurement ingestion.',
     'url': 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1456'},
    {'id': 'index-schema', 'status': 'Excluded', 'title': 'The dataset-index sheet mixes two layouts',
     'detail': 'Rows 2–13 contain audit findings, while rows 14–20 contain resource entries under the same header. No row is treated as a measurement because of a VERIFIED cell.', 'url': SHEET},
]
sources = [source_record('source-workbook.xlsx', SHEET),
           source_record('ecoli-log-tpm.csv', RAW + 'precise1k/log_tpm_qc.csv'),
           source_record('ecoli-metadata.csv', RAW + 'precise1k/metadata_qc.csv'),
           source_record('ecoli-genes.csv', RAW + 'annotation/gene_info.csv'),
           source_record('ecoli-trn.csv', RAW + 'annotation/TRN.csv'),
           source_record('yeast-supplement.zip', SUPPLEMENT),
           source_record('pmc.txt', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC154833/'),
           source_record('pride.txt', 'https://www.ebi.ac.uk/pride/ws/archive/v2/projects/PXD016519'),
           source_record('geo.txt', 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE11452'),
           source_record('GSE1456.txt', 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1456')]
bundle = {'schemaVersion': 1, 'snapshotDate': '2026-10-25', 'sourceWorkbook': SHEET,
          'trainingStatus': 'Not run', 'catalog': catalog, 'studies': studies, 'audit': audit, 'sources': sources}
for target in [APP / 'src/data/evidence.json', APP / 'public/data/chassix-evidence.json']:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + '\n')
with (APP / 'public/data/measurement-subset.csv').open('w', newline='') as handle:
    writer = csv.writer(handle)
    writer.writerow(['study', 'organism', 'strain', 'gene', 'locus', 'probe', 'value', 'unit', 'value_kind', 'reference_values', 'condition_values', 'reported_sd', 'source_url', 'source_locator'])
    for study in studies:
        for row in study['observations']:
            writer.writerow([study['id'], study['organism'], study['strain'], row['id'], row['locus'], row['probe'], row['value'], study['unit'], row['valueKind'], json.dumps(row['referenceValues']), json.dumps(row['conditionValues']), json.dumps(row['reportedSd']), study['sourceUrl'], study['sourceLocator']])
(APP / 'public/data/PRECISE-LICENSE.txt').write_text((SOURCE / 'ecoli-license.txt').read_text())
print(f"Imported {len(catalog)} catalog records, {len(studies)} studies, {sum(len(x['observations']) for x in studies)} measured-data contrasts.")
