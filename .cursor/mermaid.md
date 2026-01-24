Mermaid generation constraints:

1) Do NOT use Mermaid syntax keywords, styling keywords, or diagram-type keywords as node IDs, class names, or style names.
   Forbidden examples include (but are not limited to):
   graph, flowchart, subgraph, end, classDef, class, style, linkStyle, click, default, gantt, pie, stateDiagram.
   Also avoid using these words as prefixes or exact matches.
   If similar meaning is needed, use a business prefix/suffix, e.g. node_end, cls_default_node.

2) Do NOT use HTML <br/> line breaks in node text, especially mixed with long text and double quotes.
   Instead:
   - Use ["text"] node form for labels
   - Use normal literal newlines in the label text (not <br/>)
   - For internal quotes, prefer single quotes, or properly escape double quotes.

3) When in doubt, generate stable identifiers like: n_<topic>_<number>, cls_<topic>_<number>, st_<topic>_<number>.
Never use reserved Mermaid keywords anywhere in identifiers.