import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('tsconfig.json not found');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(resolve(configPath)));
if (parsed.errors.length) {
  throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
}

const inputs = parsed.fileNames.filter(path => /\.tsx?$/.test(path));
if (!inputs.length) throw new Error('No TypeScript source files found: refusing a vacuous typecheck');
let problems = 0;
for (const path of inputs) {
  const content = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const displayPath = relative(process.cwd(), path);
  const suppressed = /@ts-(?:ignore|nocheck|expect-error)\b/g;
  for (const match of content.matchAll(suppressed)) {
    const pos = source.getLineAndCharacterOfPosition(match.index);
    console.error(`${displayPath}:${pos.line + 1}:${pos.character + 1}: error: TypeScript suppression directives are forbidden`);
    problems++;
  }
  function inspect(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      console.error(`${displayPath}:${pos.line + 1}:${pos.character + 1}: error: explicit any is forbidden; use a proven type or unknown with narrowing`);
      problems++;
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
if (problems) process.exitCode = 1;
else console.log(`Typed source policy passed: ${inputs.length} .ts source file(s), no explicit any or TS suppressions`);
