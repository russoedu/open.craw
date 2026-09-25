import type { OoxmlPackage } from './ooxml-package.client'
import { walkXml } from './xml-walk.algorithm'

/** A link from one part to another, from the part's `_rels/<part>.rels`. */
export interface Relationship {
  id:     string
  /** The type's last segment (`worksheet`, `sharedStrings`, `slide`): the transitional and strict namespaces differ only before it. */
  type:   string
  /** The target part's name within the package (`xl/worksheets/sheet1.xml`). */
  target: string
}

/**
 * The relationships of a part, targets resolved to part names. External
 * targets (hyperlinks) are left out.
 *
 * @param pkg - The package.
 * @param part - The part (`xl/workbook.xml`), or `''` for the package's own.
 * @returns The relationships by id.
 */
export function relationshipsOf (pkg: OoxmlPackage, part: string): Map<string, Relationship> {
  const directory = part.includes('/') ? part.slice(0, part.lastIndexOf('/')) : ''
  const file = part.slice(part.lastIndexOf('/') + 1)
  const relationships = new Map<string, Relationship>()
  walkXml(pkg.text(`${directory === '' ? '' : `${directory}/`}_rels/${file}.rels`), {
    open: (name, attributes) => {
      if (name !== 'Relationship' || attributes.TargetMode === 'External' || attributes.Id === undefined || attributes.Target === undefined) return
      relationships.set(attributes.Id, { id: attributes.Id, type: (attributes.Type ?? '').split('/').at(-1) ?? '', target: resolvePart(directory, attributes.Target) })
    },
  })

  return relationships
}

/**
 * The first relationship of a type.
 *
 * @param relationships - A part's relationships.
 * @param type - The type's last segment.
 * @returns It, or `undefined`.
 */
export function relationshipOfType (relationships: ReadonlyMap<string, Relationship>, type: string): Relationship | undefined {
  for (const relationship of relationships.values()) {
    if (relationship.type === type) return relationship
  }

  return undefined
}

/** A target relative to its source part's directory (`worksheets/sheet1.xml`, `../media/x.png`) or absolute (`/xl/…`). */
function resolvePart (directory: string, target: string): string {
  const segments = target.startsWith('/') ? [] : directory.split('/').filter(segment => segment !== '')
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '.' && segment !== '') segments.push(segment)
  }

  return segments.join('/')
}
