import { Tag } from "lucide-react";
import type { VaultTagSummary } from "../../../vault";
import { cx } from "../../../shared/ui";
import type { KnowledgeTextBundle } from "../types";

type TagsPanelProps = {
  t: KnowledgeTextBundle;
  tags: VaultTagSummary[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
};

export function TagsPanel({
  t,
  tags,
  selectedTag,
  onSelectTag,
}: TagsPanelProps) {
  return (
    <div className="knowledge-section vault-tags-panel" role="tabpanel">
      <h3>{t.knowledge.tagList}</h3>
      <div className="tag-list">
        {tags.length ? tags.map((item) => (
          <button
            key={item.tag}
            type="button"
            className={cx("tag-filter-button", selectedTag === item.tag && "selected")}
            onClick={() => onSelectTag(item.tag)}
          >
            <Tag size={13} />
            <span>#{item.tag}</span>
            <small>{item.count}</small>
          </button>
        )) : (
          <p className="muted">{t.knowledge.noTags}</p>
        )}
      </div>
    </div>
  );
}
