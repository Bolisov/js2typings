import * as fs from 'fs';
import * as chalk from 'chalk';
import * as _ from 'lodash';
import { parse } from './parser';
import { format } from './writer';

generate(`F:/Projects/GitHub/yeoman-test/lib/index.js`, 'yeoman-test.d.ts');


function generate(filename: string, outFile: string) {

    let buffer = fs.readFileSync(filename);
    let modules = parse(buffer.toString());

    let typings = format(modules);

    console.log(typings);

    //let program = esprima.parse(buffer.toString(), { comment: true, attachComment: true });

    //let typings = writeTypings(modules);

    //console.log(typings);

    //fs.writeFileSync(outFile, typings);
}