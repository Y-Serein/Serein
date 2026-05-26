import { Link2, MessageSquareText } from "lucide-react";
import type { KnowledgePanelCommonProps } from "../types";

type BacklinksPanelProps = Pick<
  KnowledgePanelCommonProps,
  "t" | "vaultMode" | "activeBacklinks" | "activeUnlinkedMentions" | "onSourceLocationClick"
>;

export function BacklinksPanel({
  t,
  vaultMode,
  activeBacklinks,
  activeUnlinkedMentions,
  onSourceLocationClick,
}: BacklinksPanelProps) {
  return (
    <div className="knowledge-section" role="tabpanel">
      <h3>{t.knowledge.linkedMentions}</h3>
      <div className="link-list">
        {activeBacklinks.length ? activeBacklinks.map((backlink, index) => (
          <button
            key={`${backlink.sourcePath}-${backlink.sourceLine}-${index}`}
            type="button"
            className="link-item relation-item backlink-item"
            onClick={() => onSourceLocationClick(backlink.sourcePath, backlink.sourceLine, backlink.sourceSnippet || backlink.rawTarget)}
          >
            <Link2 size={14} aria-hidden="true" />
            <strong>{backlink.sourceTitle}</strong>
            <span>{backlink.sourceRelativePath} · L{backlink.sourceLine}</span>
            <small>
              <MessageSquareText size={12} aria-hidden="true" />
              {backlink.sourceSnippet || backlink.rawTarget}
            </small>
          </button>
        )) : (
          <p className="muted">
            {vaultMode ? t.knowledge.noBacklinks : t.knowledge.openVaultForBacklinks}
          </p>
        )}
      </div>
      {activeUnlinkedMentions.length ? (
        <div className="unlinked-mentions backlink-unlinked-mentions">
          <strong>{t.knowledge.unlinkedMentions}</strong>
          {activeUnlinkedMentions.slice(0, 12).map((mention) => (
            <button
              type="button"
              className="unlinked-mention-row"
              key={`${mention.sourcePath}-${mention.line}-${mention.matchedText}`}
              onClick={() => onSourceLocationClick(mention.sourcePath, mention.line, mention.snippet || mention.matchedText)}
            >
              <MessageSquareText size={13} aria-hidden="true" />
              <span>
                <strong>{mention.sourceTitle}</strong>
                <small>{mention.sourceRelativePath} · L{mention.line}</small>
              </span>
              <em>{mention.snippet}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
