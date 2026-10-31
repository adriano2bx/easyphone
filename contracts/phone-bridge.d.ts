export type SipTransport = 'udp' | 'tcp' | 'tls';

export type RegistrationState =
  | 'offline'
  | 'connecting'
  | 'registering'
  | 'registered'
  | 'authentication-failed'
  | 'error';

export type CallState =
  | 'ringing'
  | 'connecting'
  | 'early-media'
  | 'active'
  | 'held'
  | 'ending'
  | 'ended'
  | 'failed';

export interface SipAccountDraft {
  label: string;
  username: string;
  authUsername?: string;
  domain: string;
  port?: number;
  outboundProxy?: string;
  transport: SipTransport;
  password: string;
}

export interface SipAccountSummary {
  id: string;
  label: string;
  username: string;
  domain: string;
  transport: SipTransport;
  state: RegistrationState;
  detail?: string;
}

export interface PhoneCall {
  id: string;
  direction: 'incoming' | 'outgoing';
  remoteUri: string;
  displayName?: string;
  state: CallState;
  startedAt?: number;
  muted: boolean;
  held: boolean;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: 'input' | 'output';
}

export interface PhoneSnapshot {
  accounts: SipAccountSummary[];
  selectedAccountId: string | null;
  call: PhoneCall | null;
  audioDevices: AudioDevice[];
  inputDeviceId: string | null;
  outputDeviceId: string | null;
}

/** Narrow renderer API. Never expose the Baresip control socket or filesystem. */
export interface PhoneBridge {
  snapshot(): Promise<PhoneSnapshot>;
  onSnapshot(listener: (snapshot: PhoneSnapshot) => void): () => void;
  saveAccount(draft: SipAccountDraft): Promise<{ id: string }>;
  removeAccount(accountId: string): Promise<void>;
  selectAccount(accountId: string): Promise<void>;
  register(accountId: string): Promise<void>;
  unregister(accountId: string): Promise<void>;
  dial(destination: string): Promise<void>;
  answer(callId: string): Promise<void>;
  reject(callId: string): Promise<void>;
  hangup(callId: string): Promise<void>;
  setMuted(callId: string, muted: boolean): Promise<void>;
  setHeld(callId: string, held: boolean): Promise<void>;
  sendDtmf(callId: string, digits: string): Promise<void>;
  transfer(callId: string, destination: string): Promise<void>;
  setAudioDevice(kind: 'input' | 'output', deviceId: string): Promise<void>;
}

export type BrandLogoMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Logo validado no main process (assinatura real e até 1 MiB). Fica só neste dispositivo. */
export interface BrandLogo {
  mime: BrandLogoMime;
  data: string;
}

/**
 * Marca personalizada. Ausente no demo/harness: o renderer então oculta as ações.
 * Não recebe caminhos: o arquivo é escolhido pelo diálogo nativo do aplicativo instalado.
 */
export interface BrandingBridge {
  getLogo(): Promise<BrandLogo | null>;
  chooseLogo(): Promise<{ status: 'saved' | 'cancelled' }>;
  resetLogo(): Promise<{ status: 'reset' }>;
}

declare global {
  interface Window {
    phone: PhoneBridge;
    phoneBranding?: BrandingBridge;
  }
}
