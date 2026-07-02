import type { VaultIndexedFile } from "../../../vault";
import { splitYamlPropertyValue } from "../../../shared/markdown";
import type { KnowledgeTextBundle } from "../types";

type PropertiesPanelProps = {
  t: KnowledgeTextBundle;
  activeIndexedFile: VaultIndexedFile | null | undefined;
};

export function PropertiesPanel({
  t,
  activeIndexedFile,
}: PropertiesPanelProps) {
  const properties = (activeIndexedFile?.properties ?? [])
    .filter((property) => !["tags", "aliases"].includes(property.key.toLowerCase()));
  const aliases = activeIndexedFile?.aliases ?? [];
  const tags = activeIndexedFile?.tags ?? [];

  return (
    <div className="knowledge-section properties-panel" role="tabpanel">
      <h3>{t.knowledge.propertiesTitle}</h3>
      {properties.length || tags.length ? (
        <div className="property-list">
          {tags.length ? (
            <div className="property-row prominent">
              <span>{t.knowledge.tags}</span>
              <strong className="property-chip-group">
                {tags.map((tag) => <em key={tag}>#{tag}</em>)}
              </strong>
            </div>
          ) : null}
          {properties.map((property) => (
            <div className="property-row" key={property.key}>
              <span>{property.key}</span>
              <strong className={property.key.toLowerCase() === "status" ? "property-status" : undefined}>
                {property.type === "list"
                  ? splitYamlPropertyValue(property.value).join(", ") || t.knowledge.none
                  : property.value || t.knowledge.none}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t.knowledge.noProperties}</p>
      )}

      <h3>{t.knowledge.aliases}</h3>
      {aliases.length ? (
        <div className="alias-list">
          {aliases.map((alias) => <span key={alias}>{alias}</span>)}
        </div>
      ) : (
        <p className="muted">{t.knowledge.none}</p>
      )}
    </div>
  );
}
