/** Why a file could not be read. */
export type OfficeReadErrorCode =
  /** The source is not something bytes can be read from (an `http:` URL, a number…). */
  | 'bad-source' |
  /** The bytes are not a zip package, nor a legacy Office file. */
  'not-zip' |
  /** An entry, or the entries read together, declare more bytes than the limits allow. */
  'too-large' |
  /** A legacy binary Office file (`.xls`, `.ppt`, `.doc`). */
  'legacy-format' |
  /** A password-protected Office file. */
  'encrypted' |
  /** An OpenDocument file (`.ods`, `.odp`). */
  'unsupported-format' |
  /** A zip package that is not a spreadsheet. */
  'not-xlsx' |
  /** A zip package that is not a presentation. */
  'not-pptx' |
  /** A part the package needs is missing or malformed. */
  'malformed'

/** A file `office-reader` cannot read, with a `code` to branch on and a message that says what to do. */
export class OfficeReadError extends Error {
  override readonly name = 'OfficeReadError'

  constructor (readonly code: OfficeReadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}
