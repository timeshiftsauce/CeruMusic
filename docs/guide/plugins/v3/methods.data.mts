import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { CONTRACT } from '@shiqianjiang/ceru-plugin-core/contract'

const require = createRequire(import.meta.url)
const directory = dirname(require.resolve('@shiqianjiang/ceru-plugin-sdk'))
const entry = join(directory, 'index.d.ts')

export default {
  watch: [join(directory, '**/*.d.ts').replaceAll('\\', '/')],
  load() {
    const program = ts.createProgram([entry], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      strict: true,
      skipLibCheck: true
    })
    const checker = program.getTypeChecker()
    const source = program.getSourceFile(entry)!
    const context = source.statements.find((node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.text === 'PluginContext')
    if (!context) throw Error('SDK 缺少 PluginContext 声明')
    const format = ts.TypeFormatFlags.NoTruncation
    // TypeScript may qualify imported types with the build machine's absolute path.
    const portable = (value: string) => value.replace(/import\("[^"]+"\)\./g, '')
    const display = (type: ts.Type) => portable(checker.typeToString(type, context, format))
    const docs = (symbol: ts.Symbol) => ts.displayPartsToString(symbol.getDocumentationComment(checker))
    function fieldsOf(type: ts.Type) {
      const object = checker.getNonNullableType(type)
      if (!(object.flags & ts.TypeFlags.Object) || checker.isArrayType(object) || object.getCallSignatures().length) return []
      return object.getProperties().flatMap(field => {
        const declaration = field.valueDeclaration
        if (!declaration || !ts.isPropertySignature(declaration)) return []
        return [{
          name: field.name, optional: Boolean(field.flags & ts.SymbolFlags.Optional),
          type: display(checker.getTypeOfSymbolAtLocation(field, declaration)), note: docs(field)
        }]
      })
    }
    type Method = {
      path: string; signature: string; returns: string; permission: string; note: string
      params: { name: string; type: string; optional: boolean; note: string; fields: ReturnType<typeof fieldsOf> }[]
    }
    const groups: {name: string; methods: Method[]}[] = []
    for (const property of checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(context.name)!).getProperties()) {
      const name = property.name
      // Identity, runtime versions and Lodash's shared pure functions have their own reference below.
      if (['plugin', 'host', 'utils'].includes(name)) continue
      const methods: Method[] = []
      function visit(type: ts.Type, path: string) {
        for (const field of type.getProperties()) {
          const member = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(field, context!))
          const key = path + '.' + field.name
          const signatures = member.getCallSignatures()
          if (!signatures.length) {
            if (member.flags & ts.TypeFlags.Object && !checker.isArrayType(member)) visit(member, key)
            continue
          }
          for (const signature of signatures) {
            const rule = CONTRACT['services.' + key as keyof typeof CONTRACT] ?? CONTRACT[key as keyof typeof CONTRACT]
            methods.push({
              path: key, signature: portable(checker.signatureToString(signature, context, format)),
              returns: display(signature.getReturnType()), note: docs(field),
              permission: typeof rule?.permission === 'string' ? rule.permission
                : rule?.permission === null ? '此调用没有独立权限，宿主仍检查归属与输入'
                : typeof rule?.permission === 'function' ? '依当前操作或资源范围决定，见对应任务指南'
                : '按实际使用的宿主能力核对，见对应教程',
              params: signature.getParameters().map(param => {
                const decl = param.valueDeclaration
                const type = checker.getTypeOfSymbolAtLocation(param, context!)
                return {name: param.name, type: display(type), note: docs(param), fields: fieldsOf(type),
                  optional: !!(decl && ts.isParameter(decl) && (decl.questionToken || decl.initializer || decl.dotDotDotToken))}
              })
            })
          }
        }
      }
      visit(checker.getTypeOfSymbolAtLocation(property, context), name)
      if (methods.length) groups.push({name, methods})
    }
    return groups.sort((a,b) => a.name.localeCompare(b.name))
  }
}
