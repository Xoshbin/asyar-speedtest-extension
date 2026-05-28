export type Phase =
  | 'idle'
  | 'latency'
  | 'download'
  | 'upload'
  | 'done'
  | 'error';

export type Verdict = 'excellent' | 'good' | 'fair' | 'poor';

export interface Meta {
  isp: string;
  colo: string;
  country: string;
  ip: string;
}

export interface TestResult {
  id: string;             // ulid-like, monotonic, set when committing to history
  timestamp: number;      // ms since epoch
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  server: Meta;
  verdict: Verdict;
}

export interface QualityReport {
  verdict: Verdict;
  headline: string;
  capabilities: {
    netflix4k: boolean;
    netflixHd: boolean;
    zoomHd1on1: boolean;
    zoomHdGroup: boolean;
    cloudBackup: boolean;
    largeFileShare: boolean;
    onlineGaming: boolean;
    remoteDesktop: boolean;
  };
}

export interface ProgressEvent {
  phase: Phase;
  mbps?: number;
}

export type HistoryEntry = TestResult;
