// Wrapper for pdf-parse to avoid the module.parent issue
import { readFile } from "fs/promises";

// Dynamic import to avoid the module.parent issue
async function getPdfParse() {
  // @ts-ignore
  const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
  return pdfParseModule.default || pdfParseModule;
}

export async function parsePdf(
  dataBuffer: Buffer,
  options?: any,
): Promise<any> {
  const pdfParse = await getPdfParse();
  return pdfParse(dataBuffer, options);
}
