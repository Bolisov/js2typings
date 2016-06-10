import CodeBlockWriter from "code-block-writer";
import * as chalk from 'chalk';
import * as _ from 'lodash';
import { Module, VariableExport, FunctionExport, Type } from './parser';

interface Colors {
    text(text: string): string;
    comment(text: string): string;
    identifier(text: string): string;
    error(text: string): string;
    warning(text: string): string;
}

class Formatter {
    constructor(private writer: CodeBlockWriter, private colors: Colors) {

    }

    public formatType(types: Type[]) {
        if (types)
            return types.map(type => type.name).join(' | ');
        else
            return 'void';
    }

    public variable(part: VariableExport) {
        this.writer.write(`${this.colors.identifier(part.name)}: ${this.formatType(part.types)};`);
    }

    jsdocComment(text: string[]) {
        this.writer.writeLine(this.colors.comment('/**' + _.flatten(text.map(x => x.split(/\r\n|\r|\n/))).map(line => '\n * ' + line).join('') + '\n */'));
    }

    public function(part: FunctionExport) {

        let comments = [(part.description || '').trim()];
        const paramsWithDescriptions = _.filter(part.params, param => param.description);

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

        this.writer.write(`function ${this.colors.identifier(part.name)} (${params}) : ${this.formatType(part.result)};`);
    }

    public module(module: Module) {
        this.writer.write(`declare module "${module.name}"`);
        this.writer.block(() => {

            _.forEach(module.imports, (path, name) => {
                this.writer.writeLine(`import * as ${this.colors.identifier(name)} from "${path}"`);
            });

            _.forEach(module.exports, (part, name) => {

                this.writer.writeLine('\n');

                if (part instanceof VariableExport)
                    this.variable(part);
                else if (part instanceof FunctionExport)
                    this.function(part);
                else if (part instanceof Module)
                    this.module(part);
                else
                    console.error(this.colors.error(`Unexpected export: ` + part));

                if (part.errors) {
                    for (const error of part.errors) {
                        this.writer.writeLine(this.colors.error('// WARN: ' + error.message));
                    }
                }
            });
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

export function format(modules: Module[]) {
    const writer = new CodeBlockWriter({ newLine: '\n' });
    const formatter = new Formatter(writer, new DefaultColors());

    for (var module of modules) {
        formatter.module(module);
    }

    return writer.toString();
}