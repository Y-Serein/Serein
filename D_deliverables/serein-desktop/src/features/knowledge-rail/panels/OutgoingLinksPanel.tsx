import { ArrowUpRight, FilePlus2, Plus } from "lucide-react";
import { Button } from "../../../shared/ui";
import type { KnowledgePanelCommonProps } from "../types";

type OutgoingLinksPanelProps = Pick<
  KnowledgePanelCommonProps,
  | "t"
  | "vaultMode"
  | "activeResolvedLinks"
  | "activeUnresolvedLinks"
  | "onGraphNodeClick"
  | "onCreateUnresolvedLink"
  | "onOpenAmbiguousLink"
>;

export function OutgoingLinksPanel({
  t,
  vaultMode,
  activeResolvedLinks,
  activeUnresolvedLinks,
  onGraphNodeClick,
  onCreateUnresolvedLink,
  onOpenAmbiguousLink,
}: OutgoingLinksPanelProps) {
  return (
    <div className="knowledge-section" role="tabpanel">
      <h3>{t.knowledge.outgoingLinks}</h3>
      <div className="link-list">
        {activeResolvedLinks.length ? activeResolvedLinks.map((link, index) => (
          <button
            key={`${link.targetPath}-${index}`}
            type="button"
            className="link-item relation-item"
            onClick={() => link.targetPath && onGraphNodeClick(link.targetPath)}
          >
            {link.embedded ? <FilePlus2 size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
            <strong>{link.label || link.rawTarget}</strong>
            <span>{link.rawTarget}</span>
          </button>
        )) : (
          <p className="muted">{vaultMode ? t.knowledge.noOutgoingLinks : t.knowledge.openVaultForGraph}</p>
        )}
      </div>
      {activeUnresolvedLinks.length ? (
        <div className="unresolved-links">
          <strong>{t.knowledge.unresolvedMentions}</strong>
          {activeUnresolvedLinks.slice(0, 8).map((link, index) => (
            <div className="unresolved-link-row" key={`${link.rawTarget}-${index}`} title={link.unresolvedReason ?? ""}>
              <span>{link.rawTarget}</span>
              {link.targetCandidates.length > 1 ? (
                <Button variant="ghost" onClick={() => onOpenAmbiguousLink(link)}>{t.knowledge.choose}</Button>
              ) : link.suggestedPath ? (
                <Button variant="ghost" icon={<Plus size={13} />} onClick={() => onCreateUnresolvedLink(link)}>
                  {t.knowledge.create}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
