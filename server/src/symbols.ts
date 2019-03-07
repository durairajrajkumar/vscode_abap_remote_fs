import {
  DocumentSymbolParams,
  DocumentSymbol,
  SymbolKind
} from "vscode-languageserver"
import { clientAndObjfromUrl, rangeFromUri, parts } from "./utilities"
import { ClassComponent, Link } from "abap-adt-api"
import { log } from "./clientManager"

const typeMap: Map<string, SymbolKind> = new Map([
  ["CLAS/OA", SymbolKind.Field],
  ["CLAS/OB", SymbolKind.Null], // alias
  ["CLAS/OC", SymbolKind.Class],
  ["CLAS/OCL", SymbolKind.Class],
  ["CLAS/OF", SymbolKind.Null], // friend
  ["CLAS/OLA", SymbolKind.Field],
  ["CLAS/OLD", SymbolKind.Method],
  ["CLAS/OND", SymbolKind.Method],
  ["CLAS/ON", SymbolKind.Method],
  ["CLAS/OLF", SymbolKind.TypeParameter],
  ["CLAS/OLN", SymbolKind.Interface],
  ["CLAS/OLT", SymbolKind.TypeParameter], // implementation, local
  ["CLAS/OK", SymbolKind.Null],
  ["CLAS/OM", SymbolKind.Method],
  ["CLAS/OR", SymbolKind.Interface], // implementation
  ["CLAS/OT", SymbolKind.TypeParameter],
  ["INTF/OI", SymbolKind.Interface],
  ["INTF/IO", SymbolKind.Method],
  ["INTF/IA", SymbolKind.Field],
  ["INTF/IT", SymbolKind.TypeParameter]
])

function decodeType(comp: ClassComponent) {
  const adtType = comp["adtcore:type"]
  const mapped = typeMap.get(adtType)
  if (mapped === SymbolKind.Field && comp.constant) return SymbolKind.Constant
  if (mapped) return mapped

  log("Unknown symbol type for", comp)

  return SymbolKind.Null
}
function convertComponent(comp: ClassComponent, definition: boolean) {
  const dLink = comp.links.find(l => !!l.rel.match(/definitionIdentifier/i))
  const iLink = comp.links.find(l => !!l.rel.match(/implementationIdentifier/i))

  const mainLink = definition ? dLink : iLink
  const suffix =
    (definition && iLink && " definition") ||
    (!definition && dLink && " implementation") ||
    ""

  const range = mainLink && rangeFromUri(mainLink.href)
  if (range) {
    const symbol = new DocumentSymbol()
    symbol.range = range
    symbol.selectionRange = range
    symbol.name = comp["adtcore:name"] + suffix
    symbol.kind = decodeType(comp)
    symbol.children = comp.components
      .map(x => convertComponent(x, definition))
      .filter(x => x) as DocumentSymbol[]
    return symbol
  }
}

function filterComp(comp: ClassComponent, part: string): ClassComponent[] {
  const components: ClassComponent[] = []
  const linkfilter = (p: string) => (l: Link) => l.href.indexOf(p) >= 0
  const hasPart = (c: ClassComponent, p: string) =>
    !!c.links.find(linkfilter(p))
  const filterPart = (c: ClassComponent, p: string) => {
    const newc = { ...c }
    newc.links = c.links.filter(linkfilter(p))
    newc.components = c.components.reduce((acc, cur) => {
      acc.push(...filterComp(cur, p))
      return acc
    }, new Array<ClassComponent>())
    return newc
  }
  // if part found in comp, return comp but filter out all the non-matching links
  if (hasPart(comp, part)) components.push(filterPart(comp, part))
  else for (const c of comp.components) components.push(...filterComp(c, part))
  return components
}

export async function documentSymbols(params: DocumentSymbolParams) {
  const symbols: DocumentSymbol[] = []
  try {
    const co = await clientAndObjfromUrl(params.textDocument.uri, false)
    if (!co) return
    // classes and interfaces have their own service/format
    if (co.obj.type.match("(CLAS)|(INTF)")) {
      const pattern = /((?:(?:\/source\/)|(?:\/includes\/)).*)/
      const [part] = parts(co.obj.url, pattern)
      const classUri = co.obj.url.replace(pattern, "")

      const component = await co.client.classComponents(classUri)
      const localComp = filterComp(component, part)

      for (const sym of localComp.map(c => convertComponent(c, true)))
        if (sym) symbols.push(sym)
      for (const sym of localComp.map(c => convertComponent(c, false)))
        if (sym) symbols.push(sym)
    }
  } catch (e) {
    log("Exception in document symbol:", e.toString()) // ignore
  }
  return symbols
}
