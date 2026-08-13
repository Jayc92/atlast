import { useEffect, useRef, type ReactElement } from "react";
import type { TopologyGraphViewModel } from "./graph-projection.ts";

export interface StructuredTopologyViewProps {
  readonly view: TopologyGraphViewModel;
  readonly selected: string | undefined;
  readonly onSelect: (identifier: string) => void;
}

export function StructuredTopologyView({
  view,
  selected,
  onSelect,
}: StructuredTopologyViewProps): ReactElement {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.focus();
  }, [selected]);

  return (
    <div className="topology-structured" aria-label="Structured topology view">
      <section aria-labelledby="topology-entities-heading">
        <h3 id="topology-entities-heading">Entities</h3>
        <ul className="topology-structured-list">
          {view.nodes.map((node) => (
            <li key={node.id}>
              <button
                ref={selected === node.id ? selectedRef : undefined}
                type="button"
                aria-label={`${node.label}, ${node.entityTypes.join(", ") || "entity"}${node.ambiguous ? ", ambiguous identity" : ""}`}
                aria-pressed={selected === node.id}
                onClick={() => {
                  onSelect(node.id);
                }}
              >
                <strong>{node.label}</strong>
                <span>{node.entityTypes.join(", ") || "entity"}</span>
                {node.ambiguous && <span>Ambiguous identity</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="topology-relationships-heading">
        <h3 id="topology-relationships-heading">Relationship candidates</h3>
        {view.edges.length === 0 ? (
          <p>No relationship candidates are visible at these bounds.</p>
        ) : (
          <ul className="topology-structured-list relationships">
            {view.edges.map((edge) => (
              <li key={edge.id}>
                <button
                  ref={selected === edge.id ? selectedRef : undefined}
                  type="button"
                  aria-label={`${edge.label}: ${edge.source} to ${edge.target}${edge.conflicted ? ", conflicted candidate" : ""}${edge.renderable ? "" : ", boundary endpoint outside traversal"}`}
                  aria-pressed={selected === edge.id}
                  onClick={() => {
                    onSelect(edge.id);
                  }}
                >
                  <strong>{edge.label}</strong>
                  <span>
                    {edge.source} → {edge.target}
                  </span>
                  {edge.conflicted && <span>Conflicted candidate</span>}
                  {!edge.renderable && (
                    <span>Boundary endpoint is outside this traversal.</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {view.boundaryReferences.length > 0 && (
        <p className="topology-boundary-note">
          {view.boundaryReferences.length} endpoint reference
          {view.boundaryReferences.length === 1 ? " is" : "s are"} outside the
          loaded traversal and remain
          {view.boundaryReferences.length === 1 ? "s" : ""} visible here as
          boundary facts.
        </p>
      )}
    </div>
  );
}
