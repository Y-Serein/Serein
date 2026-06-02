import type { AppLanguage, appText } from "../../app/i18n";
import type { VaultIndexStatus } from "../../app/store/appStore";
import type { Note } from "../../domain/model";
import type { LocalGraph, VaultBacklink, VaultIndex, VaultIndexedFile, VaultLink, VaultUnlinkedMention } from "../../vault";

export type KnowledgeTextBundle = (typeof appText)[AppLanguage];

export type KnowledgePanelCommonProps = {
  t: KnowledgeTextBundle;
  vaultMode: boolean;
  vaultIndex: VaultIndex | null;
  vaultIndexStatus: VaultIndexStatus;
  activeNote: Note;
  activeIndexedFile: VaultIndexedFile | null | undefined;
  activeBacklinks: VaultBacklink[];
  activeOutgoingLinks: VaultLink[];
  activeResolvedLinks: VaultLink[];
  activeUnresolvedLinks: VaultLink[];
  activeUnlinkedMentions: VaultUnlinkedMention[];
  localGraph: LocalGraph;
  onGraphNodeClick: (path: string) => void;
  onSourceLocationClick: (path: string, line: number, text?: string | null) => void;
  onCreateUnresolvedLink: (link: VaultLink) => void;
  onOpenAmbiguousLink: (link: VaultLink) => void;
  onSearchTagSelect: (tag: string) => void;
};
