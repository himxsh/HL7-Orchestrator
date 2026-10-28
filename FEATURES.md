# Novel features

Three tools on top of the existing HL7 pipeline. Each one is reachable from the **Tools** menu, and FHIR export plus the PHI report also open from the live HL7 inspector after a pipeline run.

Set the operator token before starting the app. Reveal in the vault also needs an admin token:

```bash
export OPERATOR_TOKEN=demo-operator
export ADMIN_TOKEN=demo-admin
export VITE_OPERATOR_TOKEN="$OPERATOR_TOKEN"
bash start.sh
```

Frontend: `http://localhost:3000`. Backend: `http://localhost:8000`.

## FHIR R4 export

**Idea.** A transformed HL7 v2 ORU message can be handed to a FHIR client as a R4 collection Bundle: Patient, Observation, and DiagnosticReport.

**Why it matters.** Hospitals and national health exchanges speak FHIR R4. The pipeline already produces a sealed v2 message; an export lets that same record move without a second integration project. Pseudonyms already written into PID stay pseudonyms. The SHA-256 ZSH seal is copied onto `Bundle.meta.tag`, so the IT Act integrity mark travels with the Bundle.

**What was built.** `hl7_transform/fhir_export.py` reads ER7 segments and returns a JSON Bundle. `POST /api/fhir/export` (operator token) serves it. The `/fhir` page and the dashboard **FHIR** button render resource counts, the seal, and a downloadable `application/fhir+json` file. This is a focused subset, not a full national profile.

**How to demo.**

1. Open `/fhir`. A sample ORU is already in the box (Anita Sharma, glucose 5.4 mmol/L, a ZSH seal).
2. Click **Export FHIR R4**.
3. Confirm one Patient (family `SHARMA`, birth date `1980-01-01`, city Jaipur), one Observation (`2345-7`, value `5.4`, reference range 3.9–6.1), one DiagnosticReport, and seal `abc123def456`.
4. Click **Download JSON**.
5. Optional: run a single patient from the pipeline, open the HL7 inspector, and click **FHIR** to export that live message.

## PHI confidence report

**Idea.** Before anything is de-identified, score every populated HL7 field or CSV column with a confidence that it is personal data, and say why.

**Why it matters.** The breach scanner looks for leftovers after anonymisation. A privacy review needs the opposite: an inventory of what was personal on the way in. Field role (PID-5 is a name) and value shape (Aadhaar, PAN, email, phone) are combined into one score. At 40% and above the report shows a masked preview, not the raw value.

**What was built.** `hl7_transform/phi_report.py` and `POST /api/phi-report`. The `/phi` page and the dashboard **PHI** button show likely / review / low counts and a bar per field. Likely PHI is 75% and above.

**How to demo.**

1. Open `/phi`. The sample message is loaded.
2. Click **Score fields**.
3. Patient name, identifier, date of birth, address, phone, and the note are in the likely band. The note is typed as a government id because it matches an Aadhaar pattern. Glucose stays in the low band and is shown as `5.4`.
4. The report text does not repeat `SHARMA^ANITA` or `1234 5678 9012`.
5. Switch to **CSV table**, load the sample, and score again. `patient_email` and `subject_id` score high; `glucose` stays low.

## Reversible pseudonym vault

**Idea.** Keep the pipeline anonymizer one-way, and add a separate encrypted escrow for the rare case where an authorised person must see the original name.

**Why it matters.** Deterministic fake names preserve linkage across lab rows without a lookup table. That is the right default. A care or audit exception still needs a way back, with the original encrypted at rest and every reveal written down. DPDP §8(7) is pseudonymisation for the processing; IT Act §72A is the record of who opened the identity and why.

**What was built.** `hl7_transform/pseudonym_vault.py` stores the original name as AES-256-GCM ciphertext (PyCryptodome) under `HL7_VAULT_KEY`, or a logged demo key when that variable is unset. The pseudonym is the same name the pipeline anonymizer would emit for that subject id. `POST /api/vault/enroll` is operator-only and does not return the original. `POST /api/vault/reveal` is admin-only, requires a reason, and appends an audit event that contains the reason and not the plaintext. The `/vault` page lists pseudonyms, takes the admin token only in the reveal form, and shows the audit log.

**How to demo.**

1. Open `/vault`.
2. Enroll subject `10000032` with original name `Anita Sharma`. The table shows a fake name. It does not show Anita Sharma. The confirmation names only the pseudonym.
3. In **Reveal**, use the same subject id, reason `continuity of care`, and admin token `demo-admin`.
4. The original name appears once. The audit log gains a `REVEAL` row with that reason and actor `admin`.
5. Repeat reveal with the operator token. The page reports that an admin role is required, and the name stays hidden.

The vault file is `temp/pseudonym_vault.json` (override with `HL7_VAULT_PATH`). It holds ciphertext. The last 200 audit events are kept in that file.

## Also on this branch

- Operator and admin bearer tokens from `feature/auth-dependency`. Protected routes return 401 without `Authorization: Bearer`. The UI sends `VITE_OPERATOR_TOKEN`. Downloads use that header instead of a navigation that would drop it.
- Python 3.14 compatibility from `python-314-compat`: numeric id generation uses an int bound, and the deprecation test listens to the warnings module.
- AES-256-CBC requires PyCryptodome. The SHA-512 simulation fallback in `hl7_transform/encryption.py` is gone.
- CI runs the backend tests on Python 3.11 and 3.14, then the frontend typecheck, production build, and Docker image build.
