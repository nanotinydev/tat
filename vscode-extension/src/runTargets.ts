export interface RunTreeNode {
  id: string;
  kind: 'file' | 'suite' | 'test';
  fileKey: string;
  suiteName?: string;
  testName?: string;
  children: RunTreeNode[];
}

export interface RunTargetSelection {
  fileKey: string;
  suiteName?: string;
  testName?: string;
}

export function collectRunTargets(
  include: readonly RunTreeNode[],
  exclude: readonly RunTreeNode[] = [],
): RunTargetSelection[] {
  const roots = uniqueNodes(include).filter((node, index, all) => (
    !all.some((other, otherIndex) => otherIndex !== index && isAncestor(other, node))
  ));
  const excludedLeafIds = new Set(
    uniqueNodes(exclude).flatMap((node) => getLeafTests(node).map((leaf) => leaf.id)),
  );

  return roots.flatMap((node) => collectTargetsForNode(node, excludedLeafIds));
}

function collectTargetsForNode(
  node: RunTreeNode,
  excludedLeafIds: ReadonlySet<string>,
): RunTargetSelection[] {
  const allLeaves = getLeafTests(node);
  const remainingLeaves = allLeaves.filter((leaf) => !excludedLeafIds.has(leaf.id));

  if (remainingLeaves.length === 0) {
    return [];
  }

  if (node.kind === 'test') {
    return [{
      fileKey: node.fileKey,
      suiteName: node.suiteName,
      testName: node.testName,
    }];
  }

  if (remainingLeaves.length === allLeaves.length) {
    return [{
      fileKey: node.fileKey,
      suiteName: node.kind === 'suite' ? node.suiteName : undefined,
      testName: undefined,
    }];
  }

  return node.children.flatMap((child) => collectTargetsForNode(child, excludedLeafIds));
}

function getLeafTests(node: RunTreeNode): RunTreeNode[] {
  if (node.kind === 'test') {
    return [node];
  }

  return node.children.flatMap((child) => getLeafTests(child));
}

function uniqueNodes(nodes: readonly RunTreeNode[]): RunTreeNode[] {
  const seen = new Set<string>();
  const result: RunTreeNode[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    result.push(node);
  }

  return result;
}

function isAncestor(parent: RunTreeNode, child: RunTreeNode): boolean {
  if (parent.id === child.id) {
    return true;
  }

  if (parent.fileKey !== child.fileKey) {
    return false;
  }

  if (parent.kind === 'file') {
    return true;
  }

  if (parent.kind === 'suite') {
    return child.kind === 'test' && parent.suiteName === child.suiteName;
  }

  return false;
}
