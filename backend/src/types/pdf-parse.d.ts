interface PdfParseResult {
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: unknown;
  text: string;
  version: string;
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export = pdfParse;
}

declare module 'pdf-parse' {
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export = pdfParse;
}
