import type { VaultIndexedFile } from "../../../vault";
import type { KnowledgeTextBundle } from "../types";

type PropertiesPanelProps = {
  t: KnowledgeTextBundle;
  activeIndexedFile: VaultIndexedFile | null | undefined;
};

export function PropertiesPanel({
  t,
  activeIndexedFile,
}: PropertiesPanelProps) {
  const properties = activeIndexedFile?.properties ?? [];
  const aliases = activeIndexedFile?.aliases ?? [];

  return (
    <div className="knowledge-section properties-panel" role="tabpanel">
      <h3>{t.knowledge.propertiesTitle}</h3>
      {properties.length ? (
        <div className="property-list">
          {properties.map((property) => (
            <div className="property-row" key={property.key}>
              <span>{property.key}</span>
              <strong>{property.value || t.knowledge.none}</strong>
              <small>{property.type}</small>
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
