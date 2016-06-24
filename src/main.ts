import * as fs from 'fs';

import * as chalk from 'chalk';
import * as _ from 'lodash';
import { parseCode } from './parser';
import { format } from './writer';

generate(process.argv[2], process.argv[3]);

function generate(filename: string, outFile?: string) {

    let buffer = fs.readFileSync(filename);
    let modules = parseCode(buffer.toString(), "yeoman-test");
    
    let typings = format(modules);

    if (outFile)
        fs.writeFileSync(outFile, typings);
    else
        console.log(typings);
}