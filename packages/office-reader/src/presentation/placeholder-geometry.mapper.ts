import { walkXml } from '../ooxml-package'

/** A rectangle in EMU (English Metric Units: 12 700 per point). */
export interface Box {
  x:      number
  y:      number
  width:  number
  height: number
}

/** Which placeholder a shape fills. */
export interface PlaceholderKey {
  type: string
  idx?: string
}

/** Where a layout or a master puts its placeholders. */
export interface PlaceholderBoxes {
  byIdx:  Map<string, Box>
  byType: Map<string, Box>
}

/**
 * The positioned placeholders of a slide layout or master. A slide's title or
 * body usually carries no position of its own: it inherits it from the
 * placeholder with the same index in its layout, else the same type, else the
 * master's.
 *
 * @param xml - The layout or master part.
 * @returns Its placeholder boxes.
 */
export function placeholderBoxes (xml: string): PlaceholderBoxes {
  const boxes: PlaceholderBoxes = { byIdx: new Map(), byType: new Map() }
  let key: PlaceholderKey | undefined
  let box: Partial<Box> | undefined
  let inShape = false
  let inXfrm = false
  walkXml(xml, {
    open: (name, attributes) => {
      if (name === 'sp') {
        inShape = true
        key = undefined
        box = undefined
      } else if (inShape && name === 'ph') {
        key = { type: attributes.type ?? 'obj', idx: attributes.idx }
      } else if (inShape && name === 'xfrm') {
        inXfrm = true
        box = {}
      } else if (inXfrm && box !== undefined) {
        readGeometry(name, attributes, box)
      }
    },
    close: (name) => {
      if (name === 'xfrm') {
        inXfrm = false
      } else if (name === 'sp') {
        inShape = false
        if (key !== undefined && isBox(box)) {
          if (key.idx !== undefined) boxes.byIdx.set(key.idx, box)
          if (!boxes.byType.has(key.type)) boxes.byType.set(key.type, box)
        }
      }
    },
  })

  return boxes
}

/**
 * Where an unpositioned placeholder sits: its layout's placeholder with the
 * same index, else the same type, else the master's of that type.
 *
 * @param key - The placeholder.
 * @param layout - The slide's layout.
 * @param master - The layout's master.
 * @returns The box, or `undefined` when neither places it.
 */
export function inheritedBox (key: PlaceholderKey, layout: PlaceholderBoxes, master: PlaceholderBoxes): Box | undefined {
  const fromIdx = key.idx === undefined ? undefined : layout.byIdx.get(key.idx)

  return fromIdx ?? layout.byType.get(key.type) ?? master.byType.get(masterType(key.type)) ?? master.byType.get(key.type)
}

/**
 * Reads `a:off` and `a:ext` into a box.
 *
 * @param name - The element's local name.
 * @param attributes - Its attributes.
 * @param box - The box to fill.
 */
export function readGeometry (name: string, attributes: Record<string, string>, box: Partial<Box>): void {
  if (name === 'off') {
    box.x = Number(attributes.x ?? 0)
    box.y = Number(attributes.y ?? 0)
  } else if (name === 'ext') {
    box.width = Number(attributes.cx ?? 0)
    box.height = Number(attributes.cy ?? 0)
  }
}

/**
 * Whether a box has all four numbers.
 *
 * @param box - A box being read.
 * @returns Whether it is complete.
 */
export function isBox (box: Partial<Box> | undefined): box is Box {
  return box?.x !== undefined && box.y !== undefined && box.width !== undefined && box.height !== undefined
}

/** A master has only title, body and the footer placeholders: a centred title is a title, anything else body text. */
function masterType (type: string): string {
  if (type === 'ctrTitle') return 'title'

  return ['subTitle', 'obj', 'body'].includes(type) ? 'body' : type
}
