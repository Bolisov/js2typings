import * as esprima from 'esprima';
import * as _ from 'lodash';

import { walk } from './walk';

namespace Doctrine {

    export function isNonNullableType(type: Type): type is NonNullableType {
        return type.type === 'NonNullableType';
    }

    export function isOptionalType(type: Type): type is OptionalType {
        return type.type === 'OptionalType';
    }

    export function isUnionType(type: Type): type is UnionType {
        return type.type === 'UnionType';
    }

    export function isNameExpression(type: Type): type is NameExpression {
        return type.type === 'NameExpression';
    }

    export function isFunctionType(type: Type): type is FunctionType {
        return type.type === 'FunctionType';
    }

    export function isTypeApplication(type: Type): type is TypeApplication {
        return type.type === 'TypeApplication';
    }

    export interface NonNullableType extends Type {
        expression: Type,
        prefix: boolean
    }

    export interface OptionalType extends Type {
        expression: Type,
    }

    export interface UnionType extends Type {
        elements: Type[],
    }

    export interface NameExpression extends Type {
        name: string,
    }

    export interface FunctionType extends Type {
        params: Type[],
        result: Type
    }

    export interface TypeApplication extends Type {
        expression: Type,
        applications: Type[]
    }

    export interface Type {
        type: string,
    }

    export interface Tag {
        title: "constructor" | "param" | "return",
        description: string,
        name: string,
        type: Type
    }

    export interface AST {
        description: string,
        tags: Tag[]
    }

}


var doctrine = require("doctrine");

function getComments(node: ESTree.Node) {
    const comments = node['leadingComments'];

    if (comments) {
        for (var comment of comments) {
            if (comment.type === "Block") {
                let text = comment.value as string;
                return text.split(/\r\n|\r|\n/).map(line => line.trim()).join('\n').trim();
            }
        }
    }
}

// function isFunctionDeclaration(node: ESTree.Node): node is ESTree.FunctionDeclaration {
//     return node.type === "FunctionDeclaration";
// }

// function isVariableDeclaration(node: ESTree.Node): node is ESTree.VariableDeclaration {
//     return node.type === "VariableDeclaration";
// }

// function isCallExpression(node: ESTree.Node): node is ESTree.CallExpression {
//     return node.type === "CallExpression";
// }

// function isExpressionStatement(node: ESTree.Node): node is ESTree.ExpressionStatement {
//     return node.type === "ExpressionStatement";
// }

// function isIdentifier(node: ESTree.Node): node is ESTree.Identifier {
//     return node.type === "Identifier";
// }

// function isLiteral(node: ESTree.Node): node is ESTree.Literal {
//     return node.type === "Literal";
// }

// function isAssignmentExpression(node: ESTree.Node): node is ESTree.AssignmentExpression {
//     return node.type === "AssignmentExpression";
// }

// function isMemberExpression(node: ESTree.Node): node is ESTree.MemberExpression {
//     return node.type === "MemberExpression";
// }

// function isFunctionExpression(node: ESTree.Node): node is ESTree.FunctionExpression {
//     return node.type === "FunctionExpression";
// }

// function isBlockStatement(node: ESTree.Node): node is ESTree.BlockStatement {
//     return node.type === "BlockStatement";
// }

function isReturnStatement(node: ESTree.Node): node is ESTree.ReturnStatement {
    return node.type === "ReturnStatement";
}

export class Type {
    namespace: string;
    name: string;
}

export class ExportBase {
    public description: string;
    public errors: ExportError[] = [];

}

export class LocalExport extends ExportBase {
    identifier: string
}

export class Parameter {
    name: string;
    description: string;
    types: Type[];
}


export class VariableExport extends ExportBase {
    types: Type[];
    exported: boolean;
}

export class FunctionExport extends ExportBase {
    params: Parameter[] = [];
    result: Type[];
    prototype: ExportMap = {};

}

export class ExportError {
    message: string
}

export class ExportMap {
    [key: string]: ExportBase
}

export class Module extends ExportBase {

    constructor() {
        super();
    }

    public locals: {
        [identifier: string]: ExportBase
    } = {};

    public imports: {
        [key: string]: string
    } = {};

    public exports: LocalExport | ExportMap
}

function parseJsDocType(type: Doctrine.Type): string[] {
    if (Doctrine.isUnionType(type)) {
        const { elements } = type;
        return _.flatten(elements.map(element => parseJsDocType(element)));
    }

    if (Doctrine.isNameExpression(type)) {
        const { name } = type;
        return [name];
    }

    throw "ENOTSUPP: " + type.type;
}

interface MatchResult {
    types: Type[],
    errors: string[]
}

function getObjectPath(node: ESTree.Node) {
    return walk<string>(node, {
        Identifier: (node) => node.name,
        MemberExpression: (node) => `${getObjectPath(node.object)}.${getObjectPath(node.property)}`
    });
}

export function parseCode(code: string, moduleName: string): ExportMap {

    const globalTypes = ['string', 'String', 'object', 'number', 'Function', 'any', 'Object', 'void'];
    const theModule = new Module();
    const exportMap = new ExportMap();
    const program = esprima.parse(code, { comment: true, attachComment: true });
    const typeMapping:
        {
            [jsType: string]: string
        } = {
            'Array': 'any[]',
        }

    function getFunctionExport(node: ESTree.Function, comments: string) {
        let { params, body } = node;
        let paramsFormatted = params.map(p => (p as ESTree.Identifier).name).join(', ');
        let exported = new FunctionExport();

        let jsdoc = (comments && doctrine.parse(comments, { unwrap: true }) || { tags: [] }) as Doctrine.AST;
        let { param, example, return: returns } = _.groupBy(jsdoc.tags, tag => tag.title);
        let jsdocParams = _.keyBy(param, tag => tag.name) || {};

        exported.result = [{ namespace: null, name: 'void' }];

        walk(body, {
            BlockStatement: (body) => {
                for (let statement of body.body) {
                    if (isReturnStatement(statement)) {
                        exported.result = [{ namespace: null, name: 'any' }];

                        if (returns) {
                            const match = matchType(_.flatten(returns.map(r => parseJsDocType(r.type))));
                            exported.result = match.types;
                            exported.errors.push(...match.errors.map(message => ({ message })));
                        } else {
                            exported.errors.push({ message: `return type is not specified` });
                        }
                    }
                }
            }
        });

        exported.params = params.map(p => {
            const name = (p as ESTree.Identifier).name;
            let types: Type[];

            if (jsdocParams[name] && jsdocParams[name].type) {
                let match = matchType(parseJsDocType(jsdocParams[name].type));
                types = match.types;
                theModule.errors.push(...match.errors.map(message => ({ message })));
            } else {
                types = [{ namespace: null, name: 'any' }];
                exported.errors.push({ message: `parameter "${name}" type is not specified` });
            }

            return {
                name: name,
                types: types,
                description: jsdocParams[name] && jsdocParams[name].description,
                errors: []
            }
        });

        exported.description = jsdoc.description;

        return exported;
    }

    function getExport(node: ESTree.Expression, comments: string): ExportBase {

        return walk<ExportBase>(node, {
            FunctionExpression: (node) => getFunctionExport(node, comments),
            Identifier: (node) => {
                let e = new LocalExport();
                e.identifier = node.name;
                return e;
            }
        });
    }

    function matchType(jsTypes: string[]): MatchResult {
        const errors = [];
        const types = jsTypes.map(type => {
            const [part1, part2] = type.split(':', 2);
            let namespace = part2 ? part1 : null;
            let name = part2 ? part2 : part1;
            name = typeMapping[name] || name;

            return { namespace, name };
        });
        return { types, errors };
    }

    for (var node of program.body) {
        const comments = getComments(node);

        walk(node, {
            VariableDeclaration: (node) =>
                node.declarations.forEach(declarator =>
                    walk(declarator.id, {
                        Identifier: (id) =>
                            walk(declarator.init, {
                                FunctionExpression: (functionExpression) => {
                                    theModule.locals[id.name] = getExport(functionExpression, comments);
                                },
                                CallExpression: (init) =>
                                    walk(init.callee, {
                                        Identifier: (callee) => {
                                            if (callee.name === "require" && init.arguments && init.arguments.length === 1) {

                                                const argument: ESTree.Literal = init.arguments[0];

                                                walk(argument, {
                                                    Literal: (argument) => { theModule.imports[id.name] = argument.value as string; }
                                                });
                                            }
                                        }
                                    })
                            })
                    })
                ),
            FunctionDeclaration: (node) => {
                theModule.locals[node.id.name] = getFunctionExport(node, comments);
            },
            ExpressionStatement: (node) => {
                const expression = node.expression;

                walk(expression, {
                    AssignmentExpression: (expression) => {
                        const { left, right } = expression;
                        let assignment = { object: null as string, property: null as string };

                        walk(left, {
                            MemberExpression: (left) => {
                                const { object, property } = left;
                                assignment.object = getObjectPath(object);
                                assignment.property = getObjectPath(property);
                            }
                        });

                        if (assignment.object === 'module' && assignment.property === "exports") {
                            /* export complete object */
                            theModule.exports = getExport(right, comments) as LocalExport;
                        }
                        else if (assignment.object === 'exports' || assignment.object === 'module.exports') {
                            exportMap[assignment.property] = getExport(right, comments);
                        }
                        else if (assignment.object.match(/\.prototype$/)) {
                            let local = theModule.locals[assignment.object.replace(/\.prototype$/, '')] as FunctionExport;
                            local.prototype[assignment.property] = getExport(right, comments);
                        }
                        else {
                            console.log(`Assignment skipped ${assignment.object}.${assignment.property}`);
                        }
                    }
                });
            }
        });
    }

    _.map(exportMap, (e, key) => {

        if (e instanceof VariableExport) {
            const { types } = e;

            for (const type of types) {
                if (type.namespace == null && globalTypes.indexOf(type.name) >= 0) continue;
                e.errors.push({ message: `Type "${type.name}" was not found` });
                type.name = 'any';
                type.namespace = null;
            }
        }
        else if (e instanceof FunctionExport) {
            const { params, result } = e;

            for (const param of params) {
                for (const type of param.types) {
                    if (type.namespace == null && globalTypes.indexOf(type.name) >= 0) continue;
                    e.errors.push({ message: `Parameter "${param.name}" type "${type.name}" was not found` });
                    type.name = 'any';
                    type.namespace = null;
                }
            }

            if (result) {
                for (const type of result) {
                    if (type.namespace == null && globalTypes.indexOf(type.name) >= 0) continue;
                    e.errors.push({ message: `Result type "${type.name}" was not found` });
                    type.name = 'any';
                    type.namespace = null;
                }
            }
        }
        else if (e instanceof LocalExport) {
            if (e.identifier === key) {
                exportMap[e.identifier] = theModule.locals[e.identifier];
                delete theModule.locals[e.identifier];                
            }
        }
    });

    if (!theModule.exports)
        theModule.exports = exportMap;

    return { [moduleName]: theModule };
}