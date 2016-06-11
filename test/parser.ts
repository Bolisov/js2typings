import * as fs from 'fs';
import * as path from 'path';
import * as chai from 'chai';
import * as _ from 'lodash';

const expect = chai.expect;

import { parseCode } from '../src/parser';
import { format } from '../src/writer';

function processDirectory(dir: string) {
    console.log(dir);

    describe(dir, () => {

        for (var item of fs.readdirSync(path.join(__dirname, dir))) {
            let sourceFile = path.join(__dirname, dir, item);
            const stat = fs.statSync(sourceFile);

            if (stat.isDirectory()) {
                processDirectory(path.join(dir, item));
            }
            else if (stat.isFile()) {
                if (item.match(/.js$/)) {
                    let name = item.replace(/.js$/, '');
                    let definitionFile = path.join(__dirname, dir, item.replace(/.js$/, '.d.ts'));

                    if (fs.existsSync(definitionFile)) {
                        it(name, () => {
                            let modules = parseCode(fs.readFileSync(sourceFile).toString(), name);
                            let typings = format(modules, { colors: false });

                            let expected = fs.readFileSync(definitionFile).toString();

                            typings = _.compact(typings.split(/\r\n|\r|\n/).map(line => line.trim())).join('\n');
                            expected = _.compact(expected.split(/\r\n|\r|\n/).map(line => line.trim())).join('\n');

                            expect(typings).to.eq(expected);
                        })
                    }
                }
            }
        }
    });
}

processDirectory('parser');