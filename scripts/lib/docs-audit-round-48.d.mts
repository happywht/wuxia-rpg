export interface Round48DocsAuditReport {
  ok: boolean;
  problems: string[];
}

export function auditRound48Docs(options: { root: string }): Promise<Round48DocsAuditReport>;
