/** Public (non-secret) view of delivery integrations for the admin UI. */

export type IntegrationSource = "db" | "none";

export interface WhatsAppIntegrationView {
  configured: boolean;
  tokenSet: boolean;
  phoneId: string;
  template: string;
  language: string;
  source: IntegrationSource;
}

export interface EmailIntegrationView {
  configured: boolean;
  passwordSet: boolean;
  host: string;
  port: string;
  user: string;
  from: string;
  imapHost: string;
  imapPort: string;
  source: IntegrationSource;
  /** Last test recipient for this admin, else their login email. */
  testTo: string;
}

export interface PushIntegrationView {
  configured: boolean;
  publicKey: string;
  subject: string;
  source: IntegrationSource;
}

export interface SignalIntegrationView {
  configured: boolean;
  linking: boolean;
  preparing: boolean;
  linkUrl: string | null;
  qrDataUrl: string | null;
  error: string | null;
  accountNumber: string | null;
}

export interface IntegrationsView {
  whatsapp: WhatsAppIntegrationView;
  email: EmailIntegrationView;
  push: PushIntegrationView;
  signal: SignalIntegrationView;
}
