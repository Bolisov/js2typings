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

function isReturnStatement(node: ESTree.Node): node is ESTree.ReturnStatement {
    return node.type === "ReturnStatement";
}

export class Type {
    constructor(public namespace, public name, ...parameters: Type[]) {
        this.parameters = parameters;
    }

    parameters: Type[] = [];
}

export class BaseDeclaration {
    constructor(public type: DeclarationType) { }

    public exported: boolean;

    public description: string;
    public errors: ExportError[] = [];
}

export class Parameter {
    name: string;
    description: string;
    types: Type[];
}

export enum DeclarationType {
    variable,
    constant,
    import,
    class,
    function,
    module,
    newInstance,
    identifier,
    object,
    typedef
}

export class VariableDeclaration extends BaseDeclaration {
    constructor(public types: Type[]) {
        super(DeclarationType.variable);
    }
}

export class Identifier extends BaseDeclaration {
    constructor(public localName: string) {
        super(DeclarationType.identifier);
    }
}

export class ConstDeclaration extends BaseDeclaration {
    constructor(public value: any) {
        super(DeclarationType.constant);
    }
}

export class TypeDefDeclaration extends BaseDeclaration {
    constructor(public types: Type[]) {
        super(DeclarationType.typedef);
    }
}

export class ImportDeclaration extends BaseDeclaration {
    constructor(public module: string, public local?: string) {
        super(DeclarationType.import);
    }
}

export class NewInstanceDeclaration extends BaseDeclaration {
    constructor(public instanceType: Type, public params: any[] = []) {
        super(DeclarationType.newInstance);
    }
}

export class ObjectDeclaration extends BaseDeclaration {
    constructor(public members: { [name: string]: FunctionDeclaration | VariableDeclaration }) {
        super(DeclarationType.object);
    }
}

export class ClassDeclaration extends BaseDeclaration {

    constructor() {
        super(DeclarationType.class);
    }

    ctor: FunctionDeclaration;

    members: {
        [name: string]: FunctionDeclaration | VariableDeclaration;
    } = {}
}

export class FunctionDeclaration extends BaseDeclaration {
    constructor() {
        super(DeclarationType.function);
    }

    params: Parameter[] = [];
    result: Type[];
}

export class ExportError {
    message: string
}

export class ModuleDeclaration extends BaseDeclaration {

    constructor() {
        super(DeclarationType.module);
    }

    items: {
        [name: string]: BaseDeclaration
    } = {};

    exports: FunctionDeclaration | VariableDeclaration | ClassDeclaration;
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

function parseJsDoc(comments: string) {
    return (comments && doctrine.parse(comments, { unwrap: true }) || { tags: [] }) as Doctrine.AST
}

export function parseCode(code: string, moduleName: string): { [name: string]: ModuleDeclaration } {
    const globalTypes = ['string', 'String', 'object', 'number', 'Function', 'any', 'Object', 'void'];
    const theModule = new ModuleDeclaration();
    const exportMap = theModule.items;
    const esprimaConfig = { comment: true, attachComment: true, sourceType: 'module' };
    const program = esprima.parse(code, esprimaConfig);
    const typeMapping:
        {
            [jsType: string]: string
        } = {
            'Array': 'any[]',
        }

    function getFunctionExport(node: ESTree.Function, comments: string) {

        let { params, body } = node;
        let paramsFormatted = params.map(p => (p as ESTree.Identifier).name).join(', ');
        let exported = new FunctionDeclaration();

        let jsdoc = parseJsDoc(comments);
        let { param, example, return: returns } = _.groupBy(jsdoc.tags, tag => tag.title);
        let jsdocParams = _.keyBy(param, tag => tag.name) || {};

        exported.result = [new Type(null, 'void')];

        walk(body, {
            BlockStatement: (body) => {
                for (let statement of body.body) {
                    if (isReturnStatement(statement)) {
                        exported.result = [new Type(null, 'any')];

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
                types = [new Type(null, 'any')];
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


    function getExport(node: ESTree.Expression, comments: string): BaseDeclaration {
        let jsdoc = parseJsDoc(comments);

        let e = walk<BaseDeclaration>(node, {
            FunctionExpression: (node) => getFunctionExport(node, comments),
            Identifier: (node) => new Identifier(node.name),
            ArrayExpression: (node) => new ConstDeclaration(node.elements.map(e => (e as ESTree.Literal).value)),
            NewExpression: (node) => {
                const { callee } = node;
                return walk(callee, {
                    Identifier: (node) => new NewInstanceDeclaration(new Type(null, node.name))
                })
            },
            ObjectExpression: (node) => {
                const properties: any = _.reduce(node.properties, (prev, current) => _.assign(prev, { [(current.key as ESTree.Identifier).name]: getExport(current.value, null) }), {});
                const e = new ObjectDeclaration(properties);
                return e;
            },
            Literal: (node) => {
                const e = new ConstDeclaration(node.value);
                e.description = jsdoc.description;
                return e;
            },
            ClassDeclaration: (node) => {
                let e = new ClassDeclaration();
                return e;
            },
            BinaryExpression: (expression) => {
                return new ConstDeclaration({});
            },
            FunctionDeclaration: (declaration) => {
                return getFunctionExport(declaration, comments);
            }
        });

        if (jsdoc)
            e.description = jsdoc.description;

        return e;
    }

    function matchType(jsTypes: string[]): MatchResult {
        const errors = [];
        const types = jsTypes.map(type => {
            const [part1, part2] = type.split(':', 2);
            let namespace = part2 ? part1 : null;
            let name = part2 ? part2 : part1;
            name = typeMapping[name] || name;
            let parameters = [];
            return { namespace, name, parameters };
        });
        return { types, errors };
    }

    debugger;

    for (var node of program.body) {
        const leadingComments: { type: string, value: string }[] = node['leadingComments'] || [];
        const [comments, ...lead] = leadingComments.map(x => x.value).reverse();

        if (lead && lead.length > 0) {
            for (let comment of lead) {
                const jsdoc = parseJsDoc(comment);

                for (let tag of jsdoc.tags) {
                    if (tag.title === 'typedef') {
                        let jsDocTypes = parseJsDocType(tag.type);
                        let types = matchType(jsDocTypes);
                        let typedef = new TypeDefDeclaration(types.types);
                        typedef.description = jsdoc.description;
                        theModule.items[tag.name] = typedef;
                        globalTypes.push(tag.name);
                    }
                }

                debugger;
            }
        }

        walk(node, {
            VariableDeclaration: (node) =>
                node.declarations.forEach(declarator =>
                    walk(declarator.id, {
                        Identifier: (id) =>
                            walk(declarator.init, {
                                FunctionExpression: (functionExpression) => {
                                    theModule.items[id.name] = getFunctionExport(functionExpression, comments);
                                },
                                Literal: (literal) => {
                                    theModule.items[id.name] = getExport(literal, comments);
                                },
                                CallExpression: (init) =>
                                    walk(init.callee, {
                                        Identifier: (callee) => {
                                            if (callee.name === "require" && init.arguments && init.arguments.length === 1) {

                                                const argument: ESTree.Literal = init.arguments[0];

                                                walk(argument, {
                                                    Literal: (argument) => {
                                                        theModule.items[id.name] = new ImportDeclaration(argument.value as string);
                                                    }
                                                });
                                            }
                                        }
                                    })
                            })
                    })
                ),
            FunctionDeclaration: (node) => {
                theModule.items[node.id.name] = getFunctionExport(node, comments);
            },
            ExpressionStatement: (node) => {
                const expression = node.expression;

                walk(expression, {
                    Literal: (literal) => { },
                    AssignmentExpression: (expression) => {
                        const { left, right } = expression;
                        let assignment = { object: null as string, property: null as string };

                        walk(left, {
                            MemberExpression: (left) => {
                                const { object, property } = left;
                                assignment.object = getObjectPath(object);
                                assignment.property = getObjectPath(property);
                            },
                            ThisExpression: (exp) => {
                                throw "Not Implemented";                                
                            }
                        });

                        if (assignment.object === 'module' && assignment.property === "exports") {
                            /* export complete object */
                            theModule.exports = getExport(right, comments) as any;
                        }
                        else if (assignment.object === 'exports' || assignment.object === 'module.exports') {
                            let lookup = getExport(right, comments) as any;

                            if (!(lookup instanceof Identifier)) {
                                exportMap[assignment.property] = lookup;
                            }

                            exportMap[assignment.property].exported = true;
                        }
                        else if (assignment.object.match(/\.prototype$/)) {
                            let className = assignment.object.replace(/\.prototype$/, '');

                            if (theModule.items[className] instanceof FunctionDeclaration) {
                                let classDeclaration = new ClassDeclaration();
                                classDeclaration.ctor = theModule.items[className] as FunctionDeclaration;
                                theModule.items[className] = classDeclaration;
                            }

                            if (theModule.items[className] instanceof ClassDeclaration) {
                                let classDeclaration = theModule.items[className] as ClassDeclaration;
                                classDeclaration.members[assignment.property] = getExport(right, comments) as any;
                            }
                        }
                        else {
                            console.log(`Assignment skipped ${assignment.object}.${assignment.property}`);
                        }
                    },
                    CallExpression: (expression) => { 
                        throw "Not implemented";
                    }
                });
            },
            ExportNamedDeclaration: (declaration) => {

                if (declaration.declaration) {
                    walk(declaration.declaration, {
                        VariableDeclaration: (variableDeclaration) => {
                            variableDeclaration.declarations.forEach((declarator) => {

                                let id = declarator.id as ESTree.Identifier;

                                if (declarator.init)
                                    exportMap[id.name] = getExport(declarator.init, comments) as any;
                                else
                                    exportMap[id.name] = new VariableDeclaration([new Type(null, 'any')]);

                                exportMap[id.name].exported = true;

                            });
                        },
                        FunctionDeclaration: (functionDeclaration) => {
                            exportMap[functionDeclaration.id.name] = getFunctionExport(functionDeclaration, comments);
                            exportMap[functionDeclaration.id.name].exported = true;
                        }
                    });
                }

                if (declaration.specifiers) {
                    declaration.specifiers.forEach(specifier => {
                        walk(specifier, {
                            ExportSpecifier: (exportSpecifier) => {
                                if (declaration.source) {
                                    let e = new ImportDeclaration((declaration.source as ESTree.Literal).value as string, exportSpecifier.local.name);
                                    e.exported = true;

                                    exportMap[exportSpecifier.exported.name] = e;
                                }
                                else {
                                    let e = new VariableDeclaration([new Type(null, "any")]);
                                    e.exported = true;
                                    exportMap[exportSpecifier.exported.name] = e;
                                }
                            }
                        });
                    })
                }
            },
            ExportDefaultDeclaration: (declaration) => {
                let e = getExport(declaration.declaration, comments);
                e.exported = true;
                exportMap['default'] = e as any;
            },
            ExportAllDeclaration: (declaration) => {
                let e = new ImportDeclaration(declaration.source.value as string, "*")
                e.exported = true;
                exportMap['*'] = e as any;
            }
        });
    }

    _.map(exportMap, (e, key) => {

        if (e instanceof VariableDeclaration) {
            const { types } = e;

            for (const type of types) {
                if (type.namespace == null && globalTypes.indexOf(type.name) >= 0) continue;
                e.errors.push({ message: `Type "${type.name}" was not found` });
                type.name = 'any';
                type.namespace = null;
            }
        }
        else if (e instanceof FunctionDeclaration) {
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
                    debugger;
                    type.name = 'any';
                    type.namespace = null;
                }
            }
        }
        else if (e instanceof Identifier) {
            if (!exportMap[e.localName]) {
                exportMap[key] = new ConstDeclaration({});
            }
        }
        // else if (e instanceof LocalExport) {
        //     if (e.identifier === key) {
        //         exportMap[e.identifier] = theModule.locals[e.identifier];
        //         delete theModule.locals[e.identifier];
        //     }
        //     else if (theModule.locals[e.identifier] == null) {
        //         exportMap[key] = new ConstDeclaration({});
        //     }
        // }
    });

    return { [moduleName]: theModule };
}