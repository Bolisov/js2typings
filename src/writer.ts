import CodeBlockWriter from "code-block-writer";
import * as chalk from 'chalk';
import * as _ from 'lodash';
import { LocalExport, ExportMap, ExportBase, Module, VariableExport, FunctionExport, Type } from './parser';

interface Colors {
    text(text: string): string;
    comment(text: string): string;
    identifier(text: string): string;
    error(text: string): string;
    warning(text: string): string;
}

class Formatter {
    constructor(private writer: CodeBlockWriter, private colors: Colors, private warnings: boolean) {

    }

    public formatType(types: Type[]) {
        if (types)
            return types.map(type => (type.parameters && type.parameters.length > 0) ? `${type.name}<${type.parameters.map(t => this.formatType([t])).join(', ')}>` : type.name).join(' | ');
        else
            return 'void';
    }

    public variable(name: string, part: VariableExport) {
        this.writer.write(`var ${this.colors.identifier(name)}: ${this.formatType(part.types)};`);
    }

    jsdocComment(text: string[]) {
        this.writer.writeLine(this.colors.comment('/**' + _.flatten(text.map(x => x.split(/\r\n|\r|\n/))).map(line => '\n * ' + line).join('') + '\n */'));
    }

    public class(name: string, part: FunctionExport) {

        this.writer
            .write(`export class ${this.colors.identifier(name)}`)
            .block(() => {
                if (part.params.length > 0) {
                    const params = part.params.map(param => `${this.colors.identifier(param.name)}: ${this.formatType(param.types)}`).join(', ');
                    this.writer.write(`constructor (${params});`);
                }

                _.forEach(part.prototype, (member, name) => {
                    if (member instanceof VariableExport)
                        this.variable(name, member);
                    else if (member instanceof FunctionExport) {
                        const params = member.params.map(param => `${this.colors.identifier(param.name)}: ${this.formatType(param.types)}`).join(', ');
                        this.writer.write(`public ${this.colors.identifier(name)} (${params}) : ${this.formatType(member.result)};`);
                    }
                });
            });
    }

    public function(name: string, part: FunctionExport) {

        const paramsWithDescriptions = _.filter(part.params, param => param.description);
        const comments = [];

        if (part.description)
            comments.push((part.description || '').trim());

        if (paramsWithDescriptions.length > 0 && comments.length > 0) {
            comments.push("");
        }

        for (const param of paramsWithDescriptions) {
            comments.push(`@param ${param.name} ${param.description}`);
        }

        if (comments.length > 0) {
            this.jsdocComment(comments);
        }

        const params = part.params.map(param => `${this.colors.identifier(param.name)}: ${this.formatType(param.types)}`).join(', ');

        this.writer.write(`function ${this.colors.identifier(name)} (${params}) : ${this.formatType(part.result)};`);
    }

    public dispatch(exports: ExportMap | LocalExport) {
        if (exports instanceof LocalExport)
            this.writer.writeLine(`export = ${exports.identifier};`);
        else if (exports instanceof VariableExport) {
            const tmpName = '__module__';
            this.variable(tmpName, exports as any as VariableExport);
            this.writer.writeLine(`export = ${tmpName};`);
        }
        else {
            _.forEach(exports, (part, name) => {

                this.writer.writeLine('\n');

                if (part instanceof VariableExport)
                    this.variable(name, part);
                else if (part instanceof FunctionExport) {
                    if (_.isEmpty(part.prototype)) {
                        this.function(name, part);
                    }
                    else {
                        this.class(name, part);
                    }
                }
                else if (part instanceof Module)
                    this.module(name, part);
                // else if (part instanceof LocalExport)
                //     this.writer.writeLine(`export ${part.identifier};`);
                else {
                    console.error(this.colors.error(`Unexpected export: ` + part));
                }

                if (this.warnings && part.errors && part.errors.length > 0) {
                    for (const error of part.errors) {
                        this.writer.writeLine(this.colors.error('// WARN: ' + error.message));
                    }
                }
            });
        }
    }

    public module(name: string, module: Module) {
        this.writer.write(`declare module "${name}"`);
        this.writer.block(() => {

            _.forEach(module.imports, (path, name) => {
                this.writer.writeLine(`import * as ${this.colors.identifier(name)} from "${path}"`);
            });

            _.forEach(module.locals, (part, name) => {
                if (part instanceof VariableExport)
                    this.variable(name, part);
                else if (part instanceof FunctionExport) {
                    this.function(name, part);
                }
                else if (part instanceof Module)
                    this.module(name, part);
                else
                    console.error(this.colors.error(`Unexpected export: ` + part));
            });

            this.dispatch(module.exports);
        });
    }
}

class DefaultColors implements Colors {
    text = (text: string) => text;
    identifier = (text: string) => chalk.magenta(text);
    comment = (text: string) => chalk.green(text);
    error = (text: string) => chalk.red(text);
    warning = (text: string) => chalk.yellow(text);
}

class NoColors implements Colors {
    text = (text: string) => text;
    identifier = (text: string) => text;
    comment = (text: string) => text;
    error = (text: string) => text;
    warning = (text: string) => text;
}

interface FormatOptions {
    colors?: boolean,
    warnings?: boolean
}

export function format(modules: ExportMap, options?: FormatOptions) {
    const option: FormatOptions = _.extend({ colors: true, warnings: true }, options);
    const writer = new CodeBlockWriter({ newLine: '\n' });
    const formatter = new Formatter(writer, option.colors ? new DefaultColors() : new NoColors(), option.warnings);

    formatter.dispatch(modules);

    return writer.toString();
}