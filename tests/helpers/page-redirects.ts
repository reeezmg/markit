import ts from 'typescript';

export function staticPageRedirect(script: string) {
  const source = ts.createSourceFile('page.ts', script, ts.ScriptTarget.Latest, true);
  let target = '';
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.every(declaration => {
      const value = declaration.initializer;
      return ts.isIdentifier(declaration.name) && value && ts.isCallExpression(value) &&
        ts.isIdentifier(value.expression) && value.expression.text === 'useRoute' && !value.arguments.length;
    })) continue;
    if (!ts.isExpressionStatement(statement)) return '';
    const call = ts.isAwaitExpression(statement.expression) ? statement.expression.expression : statement.expression;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return '';
    if (call.expression.text === 'definePageMeta') continue;
    if (call.expression.text !== 'navigateTo' || target) return '';
    const destination = call.arguments[0];
    if (destination && ts.isStringLiteral(destination)) target = destination.text;
    else if (destination && ts.isObjectLiteralExpression(destination)) {
      const path = destination.properties.find(property => ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'path');
      if (!path || !ts.isPropertyAssignment(path) || !ts.isStringLiteral(path.initializer)) return '';
      target = path.initializer.text;
    } else return '';
  }
  return target.startsWith('/') && !['/login', '/register'].includes(target) ? target : '';
}
