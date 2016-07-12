import CodeBlockWriter from "code-block-writer";
import * as chalk from 'chalk';
import * as _ from 'lodash';
import { ObjectDeclaration, ConstDeclaration, TypeDefDeclaration, ClassDeclaration, Identifier, NewInstanceDeclaration, ImportDeclaration, BaseDeclaration, ModuleDeclaration, VariableDeclaration, FunctionDeclaration, Type, DeclarationType } from './parser';

interface Colors {
    text(text: string): string;
    comment(text: string): string;
    identifier(text: string): string;
    error(text: string): string;
    warning(text: string): string;
}

interface Writers {
    variable?(name: string, part: VariableDeclaration);
    class?(name: string, part: ClassDeclaration);
    function?(name: string, part: FunctionDeclaration);
    constant?(name: string, part: ConstDeclaration);
    import?(name: string, part: ImportDeclaration);
    module?(name: string, part: ModuleDeclaration);
    identifier?(name: string, part: Identifier);
    object?(name: string, part: ObjectDeclaration);
}

function guestType(value: any) {
    if (typeof (value) === "number") {
        return 'number';
    }
    else if (typeof (value) === "string") {
        return 'string';
    }
    return "any";
}

function jsdoc(writer, colors, description, tags: { tag: string, value: string }[] = null) {
    const comments = [];

    if (description)
        comments.push((description || '').trim());

    if (tags && tags.length > 0) {
        comments.push("");

        for (const tag of tags) {
            comments.push(`${tag.tag} ${tag.value}`);
        }
    }

    if (comments.length > 0) {
        jsdocComment(writer, colors, comments);
    }
}

function jsdocComment(writer, colors, text: string[]) {
    writer.writeLine(colors.comment('/**' + _.flatten(text.map(x => x.split(/\r\n|\r|\n/))).map(line => '\n * ' + line).join('') + '\n */'));
}

function formatType(types: Type[]) {
    if (types)
        return types.map(type => (type.parameters && type.parameters.length > 0) ? `${type.name}<${type.parameters.map(t => this.formatType([t])).join(', ')}>` : type.name).join(' | ');
    else
        return 'void';
}

class RootFormatter implements Writers {
    private moduleMembers = new ModuleMembersFormatter(this.writer, this.colors, this.warnings);
    private moduleExports = new ModuleExportsFormatter(this.writer, this.colors, this.warnings);

    constructor(private writer: CodeBlockWriter, private colors: Colors, private warnings: boolean) {

    }

    public module(name: string, part: ModuleDeclaration) {

        this.writer.write(`declare module "${name}"`);
        this.writer.block(() => {

            _.forEach(part.items, (part, name) => {

                this.writer.writeLine('\n');

                let routine: Function = this.moduleMembers[DeclarationType[part.type]];

                if (!routine)
                    throw Error(`Declaration type not supported: ${DeclarationType[part.type]}`);

                routine.apply(this.moduleMembers, [name, part]);

                if (this.warnings && part.errors && part.errors.length > 0) {
                    for (const error of part.errors) {
                        this.writer.writeLine(this.colors.error('// WARN: ' + error.message));
                    }
                }
            });

            if (part.exports) {
                let formatter: Function = this.moduleExports[DeclarationType[part.exports.type]];

                if (!formatter)
                    throw Error(`Declaration type not supported: ${DeclarationType[part.exports.type]}`);

                formatter.apply(this.moduleExports, [name, part.exports]);
            };
        });
    }
}

class ObjectMembersFormatter implements Writers {

    constructor(protected writer: CodeBlockWriter, protected colors: Colors, protected warnings: boolean) {

    }

    public variable(name: string, part: VariableDeclaration) {
        this.writer.writeLine(`${name}: any`);
    }

    public function(name: string, part: FunctionDeclaration) {
        this.writer.write(`${name}: function() : any`);
        this.writer.block(() => { });
    }

    public constant(name: string, part: ConstDeclaration) {
        this.writer.writeLine(`${name}: ${JSON.stringify(part.value)}`);
    }

}

class ModuleMembersFormatter implements Writers {

    private classMembers = new ObjectMembersFormatter(this.writer, this.colors, this.warnings);

    constructor(protected writer: CodeBlockWriter, protected colors: Colors, protected warnings: boolean) {

    }

    public variable(name: string, part: VariableDeclaration) {
        if (part.exported)
            this.writer.write('export ');

        if (name !== 'default') {
            this.writer.write(`var ${this.colors.identifier(name)}: ${formatType(part.types)};`);
        }
        else {
            this.writer.write(`${this.colors.identifier(name)} {};`);
        }
    }

    public class(name: string, part: ClassDeclaration) {

        this.writer
            .write(`${part.exported ? 'export ' : ''}` + (name === 'default' ? 'default class' : `class ${this.colors.identifier(name)}`))
            .block(() => {
                if (part.ctor != null && part.ctor.params.length > 0) {
                    const params = part.ctor.params.map(param => `${this.colors.identifier(param.name)}: ${formatType(param.types)}`).join(', ');
                    this.writer.writeLine(`constructor (${params});`);
                }

                _.forEach(part.members, (member, name) => {
                    if (member instanceof VariableDeclaration)
                        this.variable(name, member);
                    else if (member instanceof FunctionDeclaration) {
                        const params = member.params.map(param => `${this.colors.identifier(param.name)}: ${formatType(param.types)}`).join(', ');
                        this.writer.writeLine(`public ${this.colors.identifier(name)} (${params}) : ${formatType(member.result)};`);
                    }
                });
            });
    }

    public function(name: string, part: FunctionDeclaration) {

        const paramsWithDescriptions = _.filter(part.params, param => param.description);
        const comments = [];      

        jsdoc(this.writer, this.colors, part.description, paramsWithDescriptions.map(pwd => ({ tag: '@param', value: `${pwd.name} ${pwd.description}` })));

        const params = part.params.map(param => `${this.colors.identifier(param.name)}: ${formatType(param.types)}`).join(', ');

        if (name === 'default')
            this.writer.writeLine(`${part.exported ? 'export ' : ''}${this.colors.identifier(name)} function (${params}) : ${formatType(part.result)};`);
        else
            this.writer.writeLine(`${part.exported ? 'export ' : ''}function ${this.colors.identifier(name)} (${params}) : ${formatType(part.result)};`);
    }

    public constant(name: string, part: ConstDeclaration) {
        const json = JSON.stringify(part.value, null, 4).replace(/\"([^(\")"]+)\":/g, "$1:");

        jsdoc(this.writer, this.colors, part.description);

        if (part.exported)
            this.writer.write('export ');

        if (name == "default") {
            this.writer.write(`default ${json};`);
        }
        else {
            this.writer.write(`var ${name}: ${guestType(part.value)};`);
        }
    }

    public import(name: string, part: ImportDeclaration) {
        if (name == part.local) {
            if (name == "*") {
                this.writer.write(`${part.exported ? 'export ' : ''}${name} from "${part.module}";`);
            }
            else {
                this.writer.write(`${part.exported ? 'export ' : ''} { ${name} } from "${part.module}";`);
            }
        }
        else {
            this.writer.write(`${part.exported ? 'export ' : ''} { ${part.local} as ${name} } from "${part.module}";`);
        }
    }

    public identifier(name: string, part: Identifier) {
        if (name === 'default') {
            this.writer.writeLine(`${part.exported ? 'export ' : ''}${name} ${part.localName};`);
        }
        else {
            this.writer.writeLine(`${part.exported ? 'export ' : ''}${name}  = ${part.localName};`);
        }
    }

    public object(name: string, part: ObjectDeclaration) {

        if (part.exported)
            this.writer.write('export ');

        if (name === 'default') {
            this.writer
                .write('default ')
                .block(() => {
                    let first = false;
                    _.forEach(part.members, (member, name) => {

                        if (first) {
                            this.writer.writeLine(',');
                        }

                        let routine: Function = this.classMembers[DeclarationType[member.type]];

                        if (!routine)
                            throw Error(`Declaration type not supported: ${DeclarationType[member.type]}`);

                        routine.apply(this.classMembers, [name, member]);

                        first = false;
                    });
                });
        }
        else {
            this.writer.write(`var ${name}: any`);
        }
    }

    public typedef(name: string, part: TypeDefDeclaration) {
        jsdoc(this.writer, this.colors, part.description);
        this.writer.write(`type ${name} = ${formatType(part.types)};`);
    }
}

class ModuleExportsFormatter extends ModuleMembersFormatter implements Writers {

    public variable(name: string, part: VariableDeclaration) {
        const tmpName = '__module__';
        super.variable(tmpName, exports as any as VariableDeclaration);
        this.writer.writeLine(`export = ${tmpName};`);
    }

    public newInstance(name: string, part: NewInstanceDeclaration) {
        this.writer.writeLine(`export = new ${formatType([part.instanceType])} (${part.params.map(x => JSON.stringify(x)).join(', ')});`);
    }

    public identifier(name: string, part: Identifier) {
        this.writer.writeLine(`export = ${part.localName};`);
    }

    public function(name: string, part: FunctionDeclaration) {
        const tmpName = '__module__';
        super.function(tmpName, part);
        this.writer.writeLine(`export = ${tmpName};`);
    }

    public constant(name: string, part: ConstDeclaration) {
        const json = JSON.stringify(part.value, null, 4).replace(/\"([^(\")"]+)\":/g, "$1:");
        this.writer.write(`export = ${json};`);
    }

    public object(name: string, part: ObjectDeclaration) {
        let typeName = '__module__';
        let localName = '__module__static__';
        let classDeclaration = new ClassDeclaration();

        classDeclaration.members = part.members;

        super.class(typeName, classDeclaration);
        super.variable(localName, new VariableDeclaration([new Type(null, typeName)]));

        this.identifier(null, new Identifier(localName));
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

export function format(modules: { [name: string]: ModuleDeclaration }, options?: FormatOptions) {
    const option: FormatOptions = _.extend({ colors: true, warnings: true }, options);
    const writer = new CodeBlockWriter({ newLine: '\n' });
    const root = new RootFormatter(writer, option.colors ? new DefaultColors() : new NoColors(), option.warnings);

    _.forEach(modules, (module, name) => root.module(name, module));

    return writer.toString();
}