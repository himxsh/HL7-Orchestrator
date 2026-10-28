/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import DatabaseSelection from './DatabaseSelection';
import BatchMode from './BatchMode';
import Dashboard from './Dashboard';
import SinglePatient from './SinglePatient';
import Compliance from './Compliance';
import Architecture from './Architecture';
import LegalFramework from './LegalFramework';
import DigitalSignatures from './DigitalSignatures';
import GDPR from './GDPR';
import Healthcare from './Healthcare';
import CaseStudies from './CaseStudies';
import DataLifecycle from './DataLifecycle';
import DataClassification from './DataClassification';
import Penalties from './Penalties';
import ConsentManagement from './ConsentManagement';
import EncryptionComparison from './EncryptionComparison';
import AuditLog from './AuditLog';
import BreachDetection from './BreachDetection';
import ComplianceScore from './ComplianceScore';
import DataLineagePage from './DataLineagePage';
import RiskAssessment from './RiskAssessment';
import AccessControl from './AccessControl';
import FhirExport from './FhirExport';
import PhiReport from './PhiReport';
import PseudonymVault from './PseudonymVault';

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/selection", element: <DatabaseSelection /> },
  { path: "/batch", element: <BatchMode /> },
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/single-patient", element: <SinglePatient /> },
  { path: "/compliance", element: <Compliance /> },
  { path: "/architecture", element: <Architecture /> },
  { path: "/legal-framework", element: <LegalFramework /> },
  { path: "/digital-signatures", element: <DigitalSignatures /> },
  { path: "/gdpr", element: <GDPR /> },
  { path: "/healthcare", element: <Healthcare /> },
  { path: "/case-studies", element: <CaseStudies /> },
  { path: "/data-lifecycle", element: <DataLifecycle /> },
  { path: "/data-classification", element: <DataClassification /> },
  { path: "/penalties", element: <Penalties /> },
  { path: "/consent", element: <ConsentManagement /> },
  { path: "/encryption", element: <EncryptionComparison /> },
  { path: "/audit-log", element: <AuditLog /> },
  { path: "/breach-detection", element: <BreachDetection /> },
  { path: "/compliance-score", element: <ComplianceScore /> },
  { path: "/data-lineage", element: <DataLineagePage /> },
  { path: "/risk-assessment", element: <RiskAssessment /> },
  { path: "/access-control", element: <AccessControl /> },
  { path: "/fhir", element: <FhirExport /> },
  { path: "/phi", element: <PhiReport /> },
  { path: "/vault", element: <PseudonymVault /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
