
interface WalkPath<TResult> {
    Identifier?: (node: ESTree.Identifier) => TResult,
    Literal?: (node: ESTree.Literal) => TResult,
    VariableDeclaration?: (node: ESTree.VariableDeclaration) => TResult,
    FunctionExpression?: (node: ESTree.FunctionExpression) => TResult,
    FunctionDeclaration?: (node: ESTree.FunctionDeclaration) => TResult,
    ExpressionStatement?: (node: ESTree.ExpressionStatement) => TResult,
    AssignmentExpression?: (node: ESTree.AssignmentExpression) => TResult,
    MemberExpression?: (node: ESTree.MemberExpression) => TResult,
    BlockStatement?: (node: ESTree.BlockStatement) => TResult,
    CallExpression?: ((node: ESTree.CallExpression) => TResult),
    ArrayExpression?: ((node: ESTree.ArrayExpression) => TResult),
    NewExpression?: (node: ESTree.NewExpression) => TResult,
    ObjectExpression?: (node: ESTree.ObjectExpression) => TResult,
    ExportNamedDeclaration?: (node: ESTree.ExportNamedDeclaration) => TResult,
}

var actualPath: string[] = [];

export function walk<TResult>(node: ESTree.Node, path: WalkPath<TResult>) {
    let step = path[node.type];

    actualPath.push(node.type);

    try {

        if (step)
            return step(node);
        else
            throw `Unexpected node type: ${node.type}. Actual path is: ${actualPath.join(' -> ')}`;
    }
    finally {
        actualPath.pop();
    }
}