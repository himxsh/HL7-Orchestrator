export const SAMPLE_HL7 = [
  "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20261028120000||ORU^R01|MSG0001|P|2.5.1",
  "PID|1||10000032^^^HOSP^MR||SHARMA^ANITA||19800101|F|||12 MG ROAD^^JAIPUR^RJ^302001||9876543210",
  "OBR|1|||2345-7^Glucose^LN|||20261028093000",
  "OBX|1|NM|2345-7^Glucose^LN||5.4|mmol/L|3.9-6.1|N|||F",
  "NTE|1||Call 1234 5678 9012 after review",
  "ZSH|1|SHA256|abc123def456|SIGNED|20261028120000",
].join("\n");

export const SAMPLE_CSV = [
  "patient_name,patient_email,glucose,subject_id",
  "Anita Sharma,nurse@hospital.test,5.4,10000032",
].join("\n");
